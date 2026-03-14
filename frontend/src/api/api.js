import axios from "axios";

export const BASE_URL = "https://beta.mphc.gov.in:8888/fast"; // Update this to your backend URL

const api = axios.create({
    baseURL: BASE_URL,
});

// Add interceptor to pick up user_id from URL if not already in headers
api.interceptors.request.use((config) => {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get("user_id") || params.get("uid") || "user123"; // default to user123 for dev
    config.headers["X-User-ID"] = userId;
    return config;
});

// 🟩 LOAD WORKSPACE (all in parallel)
const loadWorkspaceData = async (pdfId, workspaceId) => {
    const [snippets, boxes, lines, connections, highlights, pdfTexts, pdfDrawingLines, pdfBrushHighlights] = await Promise.all([
        api.get(`/snippets/pdf/${pdfId}/${workspaceId}`),
        api.get(`/boxes/pdf/${pdfId}/${workspaceId}`),
        api.get(`/lines/pdf/${pdfId}/${workspaceId}`),
        api.get(`/connections/pdf/${pdfId}/${workspaceId}`),
        api.get(`/highlights/pdf/${pdfId}`), // Highlights stay at PDF level for now as per user
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

// 🟩 SAVE Bundled PDF Annotations (All PDF annotations in one call)
export const savePdfAnnotations = (pdfId, data) =>
    api.post(`/pdfs/${pdfId}/save_annotations`, data);

api.savePdfAnnotations = savePdfAnnotations;

export { loadWorkspaceData, listWorkspaces, createWorkspace };
export default api;


