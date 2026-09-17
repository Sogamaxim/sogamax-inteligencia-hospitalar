#!/usr/bin/env python3
"""Generate the MedicalVM unit normalization map used by the frontend."""

import json
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd


def key(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value).strip().upper())
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", text)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: generate-unit-map.py SOURCE.xlsx OUTPUT.json")

    source, output = map(Path, sys.argv[1:])
    frame = pd.read_excel(source, header=None, usecols="A:B", names=["medicalvm", "standard"])
    frame = frame.dropna(subset=["medicalvm"])

    mapping: dict[str, str] = {}
    unresolved: list[str] = []
    for row in frame.itertuples(index=False):
        source_key = key(row.medicalvm)
        if pd.isna(row.standard) or not str(row.standard).strip():
            unresolved.append(str(row.medicalvm).strip())
            continue
        standard = str(row.standard).strip()
        if source_key in mapping and mapping[source_key] != standard:
            raise ValueError(f"conflicting mapping for {source_key}: {mapping[source_key]} / {standard}")
        mapping[source_key] = standard

    payload = {
        "source": source.name,
        "rule": "Coluna A = MedicalVM; Coluna B = unidade padronizada",
        "mappings": dict(sorted(mapping.items())),
        "unresolved": unresolved,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"mappings": len(mapping), "unresolved": unresolved}, ensure_ascii=False))


if __name__ == "__main__":
    main()
