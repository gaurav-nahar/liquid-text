from typing import Dict, Optional


def build_case_context(
    diary_no: Optional[str] = None,
    diary_year: Optional[str] = None,
    establishment: Optional[str] = None,
) -> Dict[str, Optional[str]]:
    def clean(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    return {
        "diary_no": clean(diary_no),
        "diary_year": clean(diary_year),
        "establishment": clean(establishment),
    }


def apply_case_context_to_dict(payload: dict, case_context: Dict[str, Optional[str]]) -> dict:
    for key, value in (case_context or {}).items():
        payload[key] = value
    return payload


def apply_case_context_to_model(instance, case_context: Dict[str, Optional[str]]) -> None:
    for key, value in (case_context or {}).items():
        if hasattr(instance, key):
            setattr(instance, key, value)
