import { useApp } from "./context/AppContext";
import PDFViewer from "./components/pdf/PDFViewer";
import Navbar from "./components/layout/Navbar";
import PDFSelector from "./components/pdf/PDFSelector";
import "./App.css";
import Workspace from "./components/workspace/Workspace";
import TraceLineLayer from "./components/workspace/TraceLineLayer";
import PdfToolPanel from "./components/layout/PdfToolPanel";
import KeyboardShortcuts from "./components/layout/KeyboardShortcuts";
import useLayoutResizer from "./components/layout/useLayoutResizer";

export default function App() {
    // Get global states and handlers from Context
    const {
        loading,
        pdfName,
        activeWorkspace,
        workspaces,
        setActiveWorkspace,
        selectedPDF,
        pdfPanelWidth,
        isResizing,
        pdfRef,
        handlePDFSelect,
        handleAddWorkspace
    } = useApp();

    const { handleMouseDownResizer, handleTouchStartResizer } = useLayoutResizer();

    if (!selectedPDF) {
        return <PDFSelector onSelect={handlePDFSelect} />;
    }

    return (
        <div className="app-container">
            <KeyboardShortcuts />
            <TraceLineLayer />
            {loading && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.5)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ background: 'white', padding: '10px 20px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                        Loading...
                    </div>
                </div>
            )}
            <Navbar />

            <div className="context-bar">
                <div
                    className="pdf-tabs-container"
                    title={pdfName || "No PDF Selected"}
                    style={{ width: `${pdfPanelWidth}%` }}
                >
                    <span className="context-label" style={{ paddingLeft: '16px' }}>File:</span>
                    <div className="workspace-tabs-scroll" style={{ paddingLeft: '0' }}>
                        <div className="workspace-tab-item active" style={{ marginTop: '8px', borderBottom: 'none' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            <span className="tab-name">{pdfName || "No PDF Selected"}</span>
                        </div>
                    </div>
                </div>
                <div className="workspace-tabs-container">
                    <span className="context-label" >Workspaces:</span>
                    <div className="workspace-tabs-scroll">
                        {workspaces.map(ws => (
                            <div
                                key={ws.id}
                                className={`context-tab workspace-tab-item ${activeWorkspace?.id === ws.id ? 'active' : ''}`}
                                onClick={() => setActiveWorkspace(ws)}
                                title={ws.name}
                            >
                                {activeWorkspace?.id === ws.id && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                )}
                                <span className="tab-name">{ws.name}</span>
                            </div>
                        ))}
                        <button
                            className="add-workspace-btn"
                            onClick={() => {
                                const name = prompt("Enter new workspace name:");
                                if (name) handleAddWorkspace(name);
                            }}
                            title="Create New Workspace"
                        >
                            +
                        </button>
                    </div>
                </div>
            </div>

            <div className="main-content" style={{ cursor: isResizing ? 'col-resize' : 'default' }}>
                <div className="pdf-view-container" style={{ width: `${pdfPanelWidth}%`, height: '100%', flex: 'none', position: 'relative' }}>
                    <PDFViewer ref={pdfRef} fileUrl={selectedPDF} />
                    <PdfToolPanel />
                </div>

                <div
                    className={`layout-resizer ${isResizing ? 'active' : ''}`}
                    onMouseDown={handleMouseDownResizer}
                    onTouchStart={handleTouchStartResizer}
                >
                    <div className="resizer-handle">
                        <span>⋮</span>
                    </div>
                </div>

                <div className="workspace-view-wrapper" style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    <Workspace />
                </div>
            </div>
        </div >
    );
}
