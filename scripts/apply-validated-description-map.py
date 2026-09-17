#!/usr/bin/env python3
"""Apply conservative MedicalVM description mappings to the static site data."""

import argparse
import json
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

import pandas as pd


IGNORED_IDENTITY = {
    "ACIDO", "ACETATO", "CLORIDRATO", "SODICO", "SODICA", "SULFATO", "POTASSIO",
    "SOLUCAO", "SOL", "INJETAVEL", "INJ", "AMPOLA", "AMP", "FRASCO", "BOLSA",
    "COMPRIMIDO", "COMP", "CAPSULA", "CAPS", "CREME", "POMADA", "XAROPE", "XPE",
    "GENERICO", "ORAL", "ESTERIL", "DESCARTAVEL", "UNIDADE", "PARA", "COM", "SEM",
}


def plain(value):
    text = unicodedata.normalize("NFD", str(value or "").upper())
    return "".join(char for char in text if unicodedata.category(char) != "Mn")


def norm(value):
    text = plain(value)
    aliases = [
        (r"\bEV\b|ENDOVENOS[AO]", " IV "),
        (r"INTRAVENOS[AO]", " IV "),
        (r"INTRAMUSCULAR", " IM "),
        (r"\bCOMPRIMIDOS?\b|\bCMP\b|\bCP\b", " COMP "),
        (r"\bCAPSULAS?\b", " CAPS "),
        (r"\bSORO\s+FISIOLOGICO\b", " CLORETO SODIO "),
        (r"\bAGUA\s+DESTILADA\b", " AGUA INJECAO "),
        (r"\bTAZOBACTAMA\b", " TAZOBACTAM "),
    ]
    for pattern, replacement in aliases:
        text = re.sub(pattern, replacement, text)
    text = re.sub(r"[^A-Z0-9%,./+X]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def identity_tokens(value):
    return {
        token.strip("%,./+") for token in norm(value).split()
        if len(token) >= 5 and token not in IGNORED_IDENTITY and not any(char.isdigit() for char in token)
    }


def concentrations(value):
    text = norm(value).replace(",", ".")
    output = []
    pattern = r"(\d+(?:\.\d+)?)\s*(MCG|MG|G|UI)\s*/\s*(?:(\d+(?:\.\d+)?)\s*)?(ML|G)"
    for number, numerator_unit, denominator, denominator_unit in re.findall(pattern, text):
        amount = float(number)
        if numerator_unit == "MCG":
            amount /= 1000
            numerator_unit = "MG"
        elif numerator_unit == "G":
            amount *= 1000
            numerator_unit = "MG"
        divisor = float(denominator or 1)
        output.append((round(amount / divisor, 6), numerator_unit, denominator_unit))
    return output


def measures(value):
    text = norm(value).replace(",", ".")
    output = defaultdict(list)
    for number, unit in re.findall(r"(\d+(?:\.\d+)?)\s*(MCG|MG|G|KG|ML|L|UI)(?![A-Z])", text):
        amount = float(number)
        if unit == "MCG":
            amount /= 1000
            unit = "MG"
        elif unit == "G":
            amount *= 1000
            unit = "MG"
        elif unit == "KG":
            amount *= 1_000_000
            unit = "MG"
        elif unit == "L":
            amount *= 1000
            unit = "ML"
        output[unit].append(round(amount, 6))
    return output


def dimensions(value):
    text = norm(value).replace(",", ".")
    result = []
    pattern = r"(?<!\d)(\d+(?:\.\d+)?)\s*(?:MM|CM|M)?\s*X\s*(\d+(?:\.\d+)?)\s*(?:MM|CM|M)?(?!\d)"
    for first, second in re.findall(pattern, text):
        first, second = float(first), float(second)
        # Needle gauges are often written as 30x8 for 30x0.8 mm. Do not
        # apply that convention to catheters, tapes, dressings or tubing.
        if "AGULHA" in text and first <= 50 and 2 < second <= 20:
            second /= 10
        result.append((round(first, 3), round(second, 3)))
    return result


def flags(value):
    text = norm(value)
    return {
        "iv": bool(re.search(r"\bIV\b", text)),
        "im": bool(re.search(r"\bIM\b", text)),
        "adult": "ADULTO" in text,
        "child": bool(re.search(r"PEDIATR|INFANTIL|\bINF\b", text)),
        "heavy": "PESAD" in text,
        "isobaric": "ISOBAR" in text,
        "tablet": "COMP" in text,
        "suspension": "SUSP" in text,
        "cream": bool(re.search(r"\bCR\b|CREME", text)),
        "drops": bool(re.search(r"\bGTS\b|GOTAS", text)),
        "sterile": "ESTERIL" in text and "NAO ESTERIL" not in text,
        "nonsterile": "NAO ESTERIL" in text,
    }


def incompatibilities(source, target):
    reasons = []
    source_tokens, target_tokens = identity_tokens(source), identity_tokens(target)
    if source_tokens and target_tokens and not source_tokens.intersection(target_tokens):
        reasons.append("produto sem identidade textual comum")

    source_conc, target_conc = concentrations(source), concentrations(target)
    if source_conc and target_conc and not set(source_conc).intersection(target_conc):
        reasons.append(f"concentração incompatível: {source_conc} x {target_conc}")

    source_measures, target_measures = measures(source), measures(target)
    for unit in set(source_measures).intersection(target_measures):
        source_values = set(source_measures[unit])
        target_values = set(target_measures[unit])
        if not source_values.intersection(target_values):
            reasons.append(f"{unit.lower()} incompatível: {sorted(source_values)} x {sorted(target_values)}")

    source_dimensions, target_dimensions = dimensions(source), dimensions(target)
    if source_dimensions and target_dimensions:
        target_dimension_set = set(target_dimensions)
        dimensions_match = any(
            pair in target_dimension_set or (pair[1], pair[0]) in target_dimension_set
            for pair in source_dimensions
        )
        if not dimensions_match:
            reasons.append(f"dimensão incompatível: {source_dimensions} x {target_dimensions}")

    source_flags, target_flags = flags(source), flags(target)
    if source_flags["iv"] and target_flags["im"] and not target_flags["iv"]:
        reasons.append("via IV incompatível com IM")
    if source_flags["im"] and target_flags["iv"] and not target_flags["im"]:
        reasons.append("via IM incompatível com IV")
    if source_flags["adult"] and target_flags["child"]:
        reasons.append("adulto incompatível com pediátrico")
    if source_flags["child"] and target_flags["adult"]:
        reasons.append("pediátrico incompatível com adulto")
    if source_flags["heavy"] and target_flags["isobaric"]:
        reasons.append("pesada incompatível com isobárica")
    if source_flags["isobaric"] and target_flags["heavy"]:
        reasons.append("isobárica incompatível com pesada")
    if source_flags["suspension"] and target_flags["tablet"]:
        reasons.append("suspensão incompatível com comprimido")
    if source_flags["cream"] and target_flags["tablet"]:
        reasons.append("creme incompatível com comprimido")
    if source_flags["drops"] and target_flags["tablet"]:
        reasons.append("gotas incompatíveis com comprimido")
    if source_flags["sterile"] and target_flags["nonsterile"]:
        reasons.append("estéril incompatível com não estéril")
    if source_flags["nonsterile"] and target_flags["sterile"]:
        reasons.append("não estéril incompatível com estéril")
    return reasons


def presentation_quantity(description, spreadsheet_value):
    text = norm(description)
    matches = re.findall(r"\bC\s*/\s*(\d+)\b", text)
    if matches:
        return max(1, int(matches[-1]))
    try:
        value = int(float(spreadsheet_value))
        return max(1, value)
    except (TypeError, ValueError):
        return 1


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mapping", required=True)
    parser.add_argument("--presentations", required=True)
    parser.add_argument("--prices", required=True)
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--market-data", required=True)
    parser.add_argument("--quarantine", required=True)
    parser.add_argument("--audit", required=True)
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    mapping = pd.read_excel(args.mapping)
    mapping = mapping.iloc[:, :2]
    mapping.columns = ["market", "target"]
    mapping["market_key"] = mapping["market"].map(norm)
    mapping["target_key"] = mapping["target"].map(norm)
    mapping = mapping.drop_duplicates(["market_key", "target_key"])

    presentations = pd.read_excel(args.presentations)
    prices = pd.read_html(args.prices, decimal=",", thousands=".")[0]
    inventory = pd.read_html(args.inventory, header=None)[0].iloc[:, [0, 5, 6]].copy()
    inventory.columns = ["inventory_id", "inventory_qty", "inventory_group"]
    inventory["inventory_id"] = pd.to_numeric(inventory["inventory_id"], errors="coerce")
    inventory["inventory_qty"] = pd.to_numeric(inventory["inventory_qty"], errors="coerce").fillna(0)
    inventory["inventory_group"] = inventory["inventory_group"].fillna("").astype(str)
    catalog = presentations.merge(
        prices[["ID", "VALOR", "CUSTO"]], left_on="Id", right_on="ID", how="left"
    )
    catalog = catalog.merge(inventory, left_on="Id", right_on="inventory_id", how="left")
    catalog["inventory_qty"] = catalog["inventory_qty"].fillna(0)
    catalog["is_active"] = ~catalog["inventory_group"].map(norm).str.contains("DESATIVADO")
    catalog["has_stock"] = catalog["inventory_qty"] > 0
    catalog["target_key"] = catalog["Descrição"].map(norm)
    catalog["presentation_qty"] = catalog.apply(
        lambda row: presentation_quantity(row["Descrição"], row["Apresentação"]), axis=1
    )
    catalog["unit_price"] = catalog["VALOR"] / catalog["presentation_qty"]
    catalog["unit_cost"] = catalog["CUSTO"] / catalog["presentation_qty"]

    with open(args.market_data, encoding="utf-8") as handle:
        site = json.load(handle)
    with open(args.quarantine, encoding="utf-8") as handle:
        quarantine = json.load(handle)

    mapping_by_source = {
        row.market_key: row for row in mapping.itertuples(index=False)
    }
    catalog_groups = {key: group for key, group in catalog.groupby("target_key")}
    accepted, rejected, not_in_mapping, target_missing = [], [], 0, []
    rejected_current_quarantined = []

    for row in site["rows"]:
        source_key = norm(row["marketDescription"])
        mapped = mapping_by_source.get(source_key)
        if mapped is None:
            not_in_mapping += 1
            continue
        reasons = incompatibilities(mapped.market, mapped.target)
        candidates = catalog_groups.get(mapped.target_key)
        if candidates is None or candidates.empty:
            target_missing.append({"row_id": row["id"], "market": mapped.market, "target": mapped.target})
            continue
        candidates = candidates[candidates["unit_price"].notna() & (candidates["unit_price"] > 0)]
        if candidates.empty:
            reasons.append("cadastro sem preço positivo")
        if reasons:
            rejected.append({"row_id": row["id"], "market": mapped.market, "target": mapped.target, "reasons": reasons})
            current_reasons = incompatibilities(row["marketDescription"], row["standardDescription"])
            if row["status"] != "Revisar" and current_reasons:
                quarantine[str(row["id"])] = [
                    "Correspondência bloqueada pela revisão conservadora",
                    *current_reasons,
                ]
                rejected_current_quarantined.append(row["id"])
            continue

        # Duplicate descriptions exist in the catalog. Prefer the product that
        # is active and actually stocked; price is never the selection key.
        selected = candidates.sort_values(
            ["is_active", "has_stock", "inventory_qty", "Id"],
            ascending=[False, False, False, True],
        ).iloc[0]
        row["standardDescription"] = str(mapped.target)
        row["confidence"] = 100
        row["status"] = "Padronizado"
        row["evidence"] = [
            "Correspondência validada pela base Teste 1 - MedicalVM",
            "Dose, concentração, volume, via e dimensões verificadas",
            f"Produto Sogamax ID {int(selected['Id'])}",
            f"Apresentação Sogamax: {int(selected['presentation_qty'])}",
        ]
        product = site["productData"][str(row["id"])]
        product["sogamaxPrice"] = round(float(selected["unit_price"]), 6)
        product["sogamaxCost"] = round(float(selected["unit_cost"]), 6)
        product["lastPurchaseCost"] = round(float(selected["unit_cost"]), 6)
        product["sogamaxProductId"] = int(selected["Id"])
        product["sogamaxPresentation"] = int(selected["presentation_qty"])
        product["sogamaxPriceSource"] = "Tabela de preços Sogamax"
        quarantine.pop(str(row["id"]), None)
        accepted.append({
            "row_id": row["id"], "market": mapped.market, "target": mapped.target,
            "sogamax_id": int(selected["Id"]), "brand": selected["Marca"],
            "presentation": int(selected["presentation_qty"]),
            "unit_price": round(float(selected["unit_price"]), 6),
            "unit_cost": round(float(selected["unit_cost"]), 6),
            "inventory_qty": float(selected["inventory_qty"]),
            "inventory_group": selected["inventory_group"],
            "candidate_count": int(len(candidates)),
        })

    counts = {"Padronizado": 0, "Provável": 0, "Revisar": 0}
    for row in site["rows"]:
        counts[row["status"]] += 1
    site["summary"]["statusCounts"] = counts
    site["summary"]["matchedMarketLines"] = sum(
        row["repetitions"] for row in site["rows"] if row["status"] != "Revisar"
    )

    audit = {
        "source_rows": len(mapping),
        "site_rows_with_mapping": len(accepted) + len(rejected) + len(target_missing),
        "accepted": accepted,
        "rejected": rejected,
        "target_missing": target_missing,
        "rejected_current_quarantined": rejected_current_quarantined,
        "site_rows_without_mapping": not_in_mapping,
        "status_counts_after": counts,
    }
    Path(args.audit).write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.apply:
        Path(args.market_data).write_text(json.dumps(site, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        Path(args.quarantine).write_text(json.dumps(quarantine, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "accepted": len(accepted), "rejected": len(rejected), "target_missing": len(target_missing),
        "status_counts_after": counts, "applied": args.apply,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
