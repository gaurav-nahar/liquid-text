import axios from "axios";

    // export const BASE_URL = "https://beta.mphc.gov.in:8888/fast"; // Update this to your backend URL
export const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
const SUMMARY_TIMEOUT_MS = Number(process.env.REACT_APP_SUMMARY_TIMEOUT_MS || 300000);

const api = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
});

// Add interceptor to pick up user_id from URL if not already in headers
api.interceptors.request.use((config) => {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get("user_id") || params.get("uid") || "user123"; // default to user123 for dev
    config.headers["X-User-ID"] = userId;
    return config;
});

// 🟩 LOAD WORKSPACE (all in parallel) - legacy, single PDF
const loadWorkspaceData = async (pdfId, workspaceId) => {
    const [snippets, boxes, lines, connections, highlights, pdfTexts, pdfDrawingLines, pdfBrushHighlights] = await Promise.all([
        api.get(`/snippets/pdf/${pdfId}/${workspaceId}`),
        api.get(`/boxes/pdf/${pdfId}/${workspaceId}`),
        api.get(`/lines/pdf/${pdfId}/${workspaceId}`),
        api.get(`/connections/pdf/${pdfId}/${workspaceId}`),
        api.get(`/highlights/pdf/${pdfId}`),
        api.get(`/pdf_texts/pdf/${pdfId}`),
        api.get(`/pdf_drawing_lines/pdf/${pdfId}`),
        api.get(`/pdf_brush_highlights/pdf/${pdfId}`),
    ]);

    return {
        snippets: snippets.data,
        boxes: boxes.data,
        lines: lines.data,
        connections: connections.data,
        highlights: highlights.data,
        pdfTexts: pdfTexts.data,
        pdfDrawingLines: pdfDrawingLines.data,
        pdfBrushHighlights: pdfBrushHighlights.data,
    };
};

// 🟩 LOAD WORKSPACE by workspace_id only — supports multi-PDF workspaces
const loadWorkspaceDataByWorkspace = async (pdfId, workspaceId) => {
    const [snippets, boxes, lines, connections, highlights, pdfTexts, pdfDrawingLines, pdfBrushHighlights] = await Promise.all([
        api.get(`/snippets/workspace/${workspaceId}`),
        api.get(`/boxes/workspace/${workspaceId}`),
        api.get(`/lines/workspace/${workspaceId}`),
        api.get(`/connections/workspace/${workspaceId}`),
        api.get(`/highlights/pdf/${pdfId}`),
        api.get(`/pdf_texts/pdf/${pdfId}`),
        api.get(`/pdf_drawing_lines/pdf/${pdfId}`),
        api.get(`/pdf_brush_highlights/pdf/${pdfId}`),
    ]);

    return {
        snippets: snippets.data,
        boxes: boxes.data,
        lines: lines.data,
        connections: connections.data,
        highlights: highlights.data,
        pdfTexts: pdfTexts.data,
        pdfDrawingLines: pdfDrawingLines.data,
        pdfBrushHighlights: pdfBrushHighlights.data,
    };
};
api.loadWorkspaceDataByWorkspace = loadWorkspaceDataByWorkspace;

// 🟩 LOAD PDF-LEVEL ANNOTATIONS ONLY (highlights, text, drawing, brush) — used on PDF tab switch
const loadPdfAnnotations = async (pdfId) => {
    const [highlights, pdfTexts, pdfDrawingLines, pdfBrushHighlights] = await Promise.all([
        api.get(`/highlights/pdf/${pdfId}`),
        api.get(`/pdf_texts/pdf/${pdfId}`),
        api.get(`/pdf_drawing_lines/pdf/${pdfId}`),
        api.get(`/pdf_brush_highlights/pdf/${pdfId}`),
    ]);
    return {
        highlights: highlights.data,
        pdfTexts: pdfTexts.data,
        pdfDrawingLines: pdfDrawingLines.data,
        pdfBrushHighlights: pdfBrushHighlights.data,
    };
};
api.loadPdfAnnotations = loadPdfAnnotations;

// 📂 WORKSPACE MANAGEMENT
const listWorkspaces = (pdfId) => api.get(`/workspace/list/${pdfId}`);
const createWorkspace = (pdfId, name) => api.post(`/workspace/create/${pdfId}?name=${encodeURIComponent(name)}`);

const openPdf = (name, path) => api.post("/pdfs/open", { name, path });

api.loadWorkspaceData = loadWorkspaceData;
api.listWorkspaces = listWorkspaces;
api.createWorkspace = createWorkspace;
api.openPdf = openPdf;

// 🟩 SAVE individual items
export const saveWorkspaceData = (pdfId, workspaceId, formData) =>
    api.post(`/workspace/save/${pdfId}/${workspaceId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });

api.saveWorkspaceData = saveWorkspaceData;

// 🟩 LOAD workspace groups
const loadWorkspaceGroups = (workspaceId) => api.get(`/workspace/groups/${workspaceId}`);
api.loadWorkspaceGroups = loadWorkspaceGroups;

// 🟩 LOAD cross-PDF links
const loadCrossPdfLinks = (workspaceId) => api.get(`/workspace/cross_pdf_links/${workspaceId}`);
api.loadCrossPdfLinks = loadCrossPdfLinks;

// 🟩 SAVE Bundled PDF Annotations (All PDF annotations in one call)
export const savePdfAnnotations = (pdfId, data) =>
    api.post(`/pdfs/${pdfId}/save_annotations`, data);

api.savePdfAnnotations = savePdfAnnotations;

// 📄 DOCUMENTATION PAGES
const listDocPages = (workspaceId) => api.get(`/documentation/workspace/${workspaceId}`);
const createDocPage = (workspaceId, page) => api.post(`/documentation/workspace/${workspaceId}`, page);
const updateDocPage = (docId, data) => api.put(`/documentation/${docId}`, data);
const deleteDocPage = (docId) => api.delete(`/documentation/${docId}`);
api.listDocPages = listDocPages;
api.createDocPage = createDocPage;
api.updateDocPage = updateDocPage;
api.deleteDocPage = deleteDocPage;

// 🟩 SUMMARIZE PDF
const summarizePdf = (text) => api.post("/pdfs/summarize", { text }, { timeout: SUMMARY_TIMEOUT_MS });
const startPdfSummary = (text) => api.post("/pdfs/summarize?async_mode=true", { text }, { timeout: 15000 });
const getPdfSummaryStatus = (cacheKey) => api.get(`/pdfs/summarize/status/${cacheKey}`, { timeout: 15000 });
api.summarizePdf = summarizePdf;
api.startPdfSummary = startPdfSummary;
api.getPdfSummaryStatus = getPdfSummaryStatus;

const ocrSelectionImage = (imageData, lang = "hin+eng") =>
    api.post("/pdfs/ocr_selection", { image_data: imageData, lang });
api.ocrSelectionImage = ocrSelectionImage;

// 🔖 BOOKMARKS
const listBookmarks = (pdfId) => api.get(`/bookmarks/pdf/${pdfId}`);
const createBookmark = (pdfId, pageNum, name) => api.post(`/bookmarks/pdf/${pdfId}`, { page_num: pageNum, name });
const deleteBookmark = (bookmarkId) => api.delete(`/bookmarks/${bookmarkId}`);
api.listBookmarks = listBookmarks;
api.createBookmark = createBookmark;
api.deleteBookmark = deleteBookmark;

export { loadWorkspaceData, listWorkspaces, createWorkspace, summarizePdf, startPdfSummary, getPdfSummaryStatus };
export default api;


