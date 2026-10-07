#!/usr/bin/env python3
"""Build the static MedicalVM dataset from the official September sources.

The generator is deliberately conservative: a DE/PARA entry only receives
Sogamax price and cost when the medical identity is compatible and the target
can be resolved unambiguously in the official Sogamax tables.
"""

import argparse
import csv
import gzip
import json
import math
import re
import runpy
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd


MATCHING = runpy.run_path(
    str(Path(__file__).with_name("apply-validated-description-map.py"))
)
norm = MATCHING["norm"]
identity_tokens = MATCHING["identity_tokens"]
incompatibilities = MATCHING["incompatibilities"]
presentation_quantity = MATCHING["presentation_quantity"]


def number(value, default=0.0):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return default
    text = str(value).strip()
    if not text:
        return default
    try:
        return float(text.replace(".", "").replace(",", "."))
    except ValueError:
        return default


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--market-csv", required=True)
    parser.add_argument("--mapping", required=True)
    parser.add_argument("--presentations", required=True)
    parser.add_argument("--prices", required=True)
    parser.add_argument("--unit-map", required=True)
    parser.add_argument("--market-data", required=True)
    parser.add_argument("--presentations-json", required=True)
    parser.add_argument("--sogamax-base", required=True)
    parser.add_argument("--quarantine", required=True)
    parser.add_argument("--audit", required=True)
    return parser.parse_args()


def compatible(source, target):
    return incompatibilities(source, target)


def candidate_score(target, description):
    target_key, description_key = norm(target), norm(description)
    reasons = compatible(target, description) + compatible(description, target)
    if reasons:
        return None
    target_identity = identity_tokens(target)
    description_identity = identity_tokens(description)
    if target_identity and description_identity:
        overlap = target_identity & description_identity
        if not overlap:
            return None
        identity_ratio = len(overlap) / len(target_identity | description_identity)
        if identity_ratio < 0.5:
            return None
    else:
        identity_ratio = 1.0
    sequence_ratio = SequenceMatcher(None, target_key, description_key).ratio()
    if sequence_ratio < 0.68:
        return None
    return round(sequence_ratio * 0.75 + identity_ratio * 0.25, 6)


def choose_official(candidates):
    active = candidates[
        ~candidates["GRUPO"].fillna("").map(norm).str.contains("DESATIVADO")
    ]
    if not active.empty:
        candidates = active
    candidates = candidates[
        candidates["VALOR"].notna()
        & (candidates["VALOR"] > 0)
        & candidates["CUSTO"].notna()
        & (candidates["CUSTO"] >= 0)
    ]
    if candidates.empty:
        return None
    # Approved September rule: when official records share the same resolved
    # Sogamax description, use the lowest positive official VALOR and record it.
    return candidates.sort_values(["VALOR", "Id"], ascending=[True, True]).iloc[0]


def resolve_target(target, exact_groups, identity_index):
    target_key = norm(target)
    exact = exact_groups.get(target_key)
    if exact is not None:
        selected = choose_official(exact)
        return selected, "exact", [] if selected is not None else ["cadastro sem preço positivo"]

    target_identity = identity_tokens(target)
    if target_identity:
        candidate_keys = set()
        for token in target_identity:
            candidate_keys.update(identity_index.get(token, ()))
    else:
        candidate_keys = set(exact_groups)
    scored = []
    for description_key in candidate_keys:
        group = exact_groups[description_key]
        description = str(group.iloc[0]["Descrição"])
        score = candidate_score(target, description)
        if score is not None:
            scored.append((score, description_key, group))
    if not scored:
        return None, "missing", ["descrição Sogamax não encontrada na tabela oficial"]
    scored.sort(key=lambda item: (-item[0], item[1]))
    best_score = scored[0][0]
    close = [item for item in scored if best_score - item[0] < 0.06]
    if len(close) > 1:
        names = sorted({str(item[2].iloc[0]["Descrição"]) for item in close})
        return None, "ambiguous", [
            "destino Sogamax ambíguo na tabela oficial",
            *names[:8],
        ]
    selected = choose_official(scored[0][2])
    if selected is None:
        return None, "missing", ["cadastro sem preço positivo"]
    return selected, "semantic", []


def main():
    args = parse_args()
    mapping = pd.read_excel(args.mapping).iloc[:, :3].copy()
    mapping.columns = ["market", "target", "unit"]
    mapping["market_key"] = mapping["market"].map(norm)
    mapping["target_key"] = mapping["target"].map(norm)

    prices = pd.read_excel(args.prices)
    presentations = pd.read_excel(args.presentations)
    catalog = presentations.merge(
        prices[["ID", "EAN", "DESCRICAO", "MARCA", "VALOR", "CUSTO", "GRUPO"]],
        left_on="Id",
        right_on="ID",
        how="left",
        suffixes=("", "_preco"),
    )
    catalog["target_key"] = catalog["Descrição"].map(norm)
    catalog["presentation_qty"] = catalog.apply(
        lambda row: presentation_quantity(row["Descrição"], row["Apresentação"]),
        axis=1,
    )
    exact_groups = {
        key: group.copy() for key, group in catalog.groupby("target_key", sort=False)
    }
    identity_index = defaultdict(set)
    for description_key, group in exact_groups.items():
        for token in identity_tokens(str(group.iloc[0]["Descrição"])):
            identity_index[token].add(description_key)

    with open(args.unit_map, encoding="utf-8") as handle:
        unit_map = json.load(handle)["mappings"]
    normalized_unit_map = {norm(key): value for key, value in unit_map.items()}

    raw_groups = defaultdict(list)
    display_names = {}
    with open(args.market_csv, encoding="latin1", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        for raw in reader:
            market_description = clean_text(raw.get("DESCRICAO_PRODUCTO"))
            market_key = norm(market_description)
            if not market_key:
                continue
            display_names.setdefault(market_key, market_description)
            raw_groups[market_key].append(raw)

    mappings_by_source = {
        key: group.copy() for key, group in mapping.groupby("market_key", sort=False)
    }
    rows = []
    product_data = {}
    quarantine = {}
    audit_rows = []
    resolution_counts = Counter()
    resolution_cache = {}

    for row_id, (market_key, raw_offers) in enumerate(raw_groups.items(), start=1):
        market_description = display_names[market_key]
        mapping_group = mappings_by_source.get(market_key)
        target = None
        mapping_unit = None
        reasons = []
        status = "Revisar"
        confidence = 0.0
        selected = None
        resolution = "unmapped"

        if mapping_group is None:
            reasons = ["Descrição ausente do DE/PARA de setembro"]
        else:
            non_dash = mapping_group[
                mapping_group["target"].astype(str).str.strip().ne("-")
            ]
            targets = {
                key: group for key, group in non_dash.groupby("target_key", sort=False)
            }
            mapping_unit = next(
                (clean_text(value) for value in mapping_group["unit"] if clean_text(value)),
                None,
            )
            if not targets:
                reasons = ["DE/PARA de setembro sem correspondência Sogamax"]
                resolution = "dash"
            elif len(targets) > 1:
                target_names = sorted(
                    {clean_text(value) for value in non_dash["target"] if clean_text(value)}
                )
                reasons = ["DE/PARA contraditório", *target_names]
                resolution = "mapping_ambiguous"
            else:
                target_group = next(iter(targets.values()))
                target = clean_text(target_group.iloc[0]["target"])
                reasons = compatible(market_description, target)
                if reasons:
                    resolution = "incompatible"
                else:
                    target_key = norm(target)
                    if target_key not in resolution_cache:
                        resolution_cache[target_key] = resolve_target(
                            target, exact_groups, identity_index
                        )
                    selected, resolution, reasons = resolution_cache[target_key]
                    if selected is not None:
                        status = "Padronizado"
                        confidence = 100.0 if resolution == "exact" else 95.0

        resolution_counts[resolution] += 1
        if selected is not None:
            standard_description = clean_text(selected["Descrição"])
            presentation = int(selected["presentation_qty"])
            full_price = float(selected["VALOR"])
            full_cost = float(selected["CUSTO"])
            unit_price = full_price / presentation
            unit_cost = full_cost / presentation
            candidates = exact_groups[norm(standard_description)]
            evidence = [
                "Correspondência validada pelo DE/PARA de setembro",
                "Dose, concentração, volume, via, tamanho e esterilidade auditados",
                f"Produto Sogamax ID {int(selected['Id'])}",
                f"Marca Sogamax: {clean_text(selected['MARCA'])}",
                f"Apresentação Sogamax: C/{presentation}",
            ]
            if resolution == "semantic":
                evidence.append(f"Destino do DE/PARA: {target}")
                evidence.append("Cadastro oficial localizado por equivalência conservadora")
            if len(candidates) > 1:
                evidence.append(
                    f"{len(candidates)} cadastros oficiais com descrição idêntica; menor VALOR positivo aplicado"
                )
            product = {
                "sogamaxPrice": round(unit_price, 6),
                "sogamaxCost": round(unit_cost, 6),
                # The official price table has no last-purchase-cost column.
                # Never fabricate it by copying the average cost.
                "lastPurchaseCost": None,
                "sogamaxProductId": int(selected["Id"]),
                "sogamaxPresentation": presentation,
                "sogamaxBrand": clean_text(selected["MARCA"]),
                "sogamaxFullPrice": round(full_price, 6),
                "sogamaxFullCost": round(full_cost, 6),
                "sogamaxPriceSource": "Tabela oficial Sogamax",
            }
        else:
            standard_description = (
                "Revisar — característica incompatível"
                if resolution in {"incompatible", "mapping_ambiguous", "ambiguous"}
                else "Correspondência Sogamax pendente de validação"
            )
            evidence = reasons or ["Correspondência segura não encontrada"]
            product = {
                "sogamaxPrice": 0,
                "sogamaxCost": 0,
                "lastPurchaseCost": None,
            }
            if resolution in {"incompatible", "mapping_ambiguous", "ambiguous"}:
                quarantine[str(row_id)] = evidence

        fallback_unit = mapping_unit or clean_text(raw_offers[0].get("UNIDADE_BASICA"))
        base_unit = normalized_unit_map.get(norm(fallback_unit), fallback_unit or "Não informado")
        offers = []
        for raw in raw_offers:
            pack_value = number(raw.get("QTDE_EMBALAGEM"), default=None)
            offers.append(
                {
                    "competitor": clean_text(raw.get("FORNECEDOR")) or "Não informado",
                    "brand": clean_text(raw.get("MARCA_COTADA")) or "Não informado",
                    "price": round(number(raw.get("PRECO_UNITARIO")), 6),
                    "quantity": round(number(raw.get("QUANTIDADE")), 6),
                    "unit": clean_text(raw.get("UNIDADE_BASICA")) or "Não informado",
                    "packSize": round(pack_value, 6) if pack_value is not None else None,
                    "baseUnit": base_unit,
                    "selected": clean_text(raw.get("SELECIONADO")).upper() == "S",
                }
            )
        product["offers"] = offers
        product_data[str(row_id)] = product
        rows.append(
            {
                "id": row_id,
                "marketDescription": market_description,
                "standardDescription": standard_description,
                "repetitions": len(raw_offers),
                "confidence": confidence,
                "status": status,
                "evidence": evidence,
            }
        )
        audit_rows.append(
            {
                "row_id": row_id,
                "market": market_description,
                "target": target,
                "status": status,
                "resolution": resolution,
                "repetitions": len(raw_offers),
                "reasons": reasons,
                "sogamax_id": int(selected["Id"]) if selected is not None else None,
            }
        )

    status_counts = Counter(row["status"] for row in rows)
    market_lines = sum(row["repetitions"] for row in rows)
    matched_lines = sum(
        row["repetitions"] for row in rows if row["status"] != "Revisar"
    )
    site = {
        "summary": {
            "marketLines": market_lines,
            "matchedMarketLines": matched_lines,
            "cleanDescriptions": len(rows),
            "sogamaxReferences": int(len(prices)),
            "statusCounts": {
                "Padronizado": status_counts["Padronizado"],
                "Provável": status_counts["Provável"],
                "Revisar": status_counts["Revisar"],
            },
            "marketFile": Path(args.market_csv).name,
            "period": "2026-09-30",
        },
        "rows": rows,
        "productData": product_data,
    }
    presentation_map = {
        clean_text(row["Descrição"]): int(row["presentation_qty"])
        for _, row in catalog.iterrows()
        if clean_text(row["Descrição"])
    }
    sogamax_base = sorted(
        {clean_text(value) for value in prices["DESCRICAO"] if clean_text(value)}
    )
    audit = {
        "sources": {
            "market_csv": Path(args.market_csv).name,
            "mapping": Path(args.mapping).name,
            "prices": Path(args.prices).name,
            "presentations": Path(args.presentations).name,
        },
        "counts": {
            "market_lines": market_lines,
            "clean_descriptions": len(rows),
            "mapping_rows": int(len(mapping)),
            "sogamax_price_rows": int(len(prices)),
            "sogamax_presentation_rows": int(len(presentations)),
            "status": dict(status_counts),
            "resolution": dict(resolution_counts),
        },
        "rows": audit_rows,
    }
    market_payload = json.dumps(
        site, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    market_path = Path(args.market_data)
    if market_path.suffix == ".gz":
        market_path.write_bytes(gzip.compress(market_payload, compresslevel=9, mtime=0))
    else:
        market_path.write_bytes(market_payload)
    Path(args.presentations_json).write_text(
        json.dumps(presentation_map, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    Path(args.sogamax_base).write_text(
        json.dumps(sogamax_base, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    Path(args.quarantine).write_text(
        json.dumps(quarantine, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    Path(args.audit).write_text(
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(audit["counts"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
