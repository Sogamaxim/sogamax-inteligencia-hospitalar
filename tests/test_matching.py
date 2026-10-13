import runpy
import unittest
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
MATCHING = runpy.run_path(str(ROOT / "scripts/apply-validated-description-map.py"))
GENERATOR = runpy.run_path(str(ROOT / "scripts/build-market-data.py"))


class ProductMatchingTests(unittest.TestCase):
    def test_glove_sizes_are_identity_critical(self):
        incompatibilities = MATCHING["incompatibilities"]
        self.assertEqual(
            incompatibilities(
                "luva procedimento g com po c/ 100un",
                "LUVA DE PROCEDIMENTO TAM G C/ PO C/100",
            ),
            [],
        )
        self.assertIn(
            "tamanho incompatível",
            " ".join(
                incompatibilities(
                    "luva procedimento pp com po c/ 100un",
                    "LUVA DE PROCEDIMENTO TAM G C/ PO C/100",
                )
            ),
        )
        self.assertEqual(
            incompatibilities(
                "Fralda Geriátrica Extra Grande",
                "FRALDA DESC GERIATRICA TAM EG PCT C/7",
            ),
            [],
        )

    def test_duplicate_catalog_prefers_greatest_positive_stock(self):
        candidates = pd.DataFrame(
            [
                {"Id": 22959, "VALOR": 17.73, "ESTOQUE": 0, "GRUPO": "COTAÇÃO"},
                {"Id": 31641, "VALOR": 17.73, "ESTOQUE": 1459, "GRUPO": "GIRO"},
                {"Id": 14387, "VALOR": 18.16, "ESTOQUE": 2006, "GRUPO": "GIRO"},
            ]
        )
        selected = GENERATOR["choose_official"](candidates)
        self.assertEqual(int(selected["Id"]), 14387)

    def test_brazilian_stock_thousands_are_not_decimals(self):
        inventory_number = GENERATOR["inventory_number"]
        self.assertEqual(inventory_number("2.240"), 2240)
        self.assertEqual(inventory_number("28.649"), 28649)
        self.assertEqual(inventory_number("-4"), -4)


if __name__ == "__main__":
    unittest.main()
