"""Write the JSON Schema for every public type to ../schema/optilab.schema.json."""
import json
import pathlib
import sys

from optilab.models import ApiSchema

out = pathlib.Path(__file__).resolve().parents[2] / "schema" / "optilab.schema.json"
text = json.dumps(ApiSchema.model_json_schema(), indent=2, sort_keys=True) + "\n"
if "--check" in sys.argv:
    if not out.exists() or out.read_text() != text:
        sys.exit("schema/optilab.schema.json is stale: run `python scripts/export_schema.py`")
else:
    out.write_text(text)
    print("wrote", out)
