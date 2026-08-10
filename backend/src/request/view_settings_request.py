from pydantic import BaseModel


class ViewSettingsUpdate(BaseModel):
    """PDF view layout shared by every PDF open under one diary case.

    Only zoom and panel sizing are persisted — no tool/sidebar state.
    """

    zoomLevel: float | None = None
    pdfPanelWidth: float | None = None
    pdf2PanelWidth: float | None = None
    pdf2Zoom: float | None = None

    class Config:
        extra = "ignore"
