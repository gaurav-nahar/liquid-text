import React, { useEffect, useRef, useState } from "react";
import api from "../../api/api";

const JUDGES = [
    { id: 41,  name: "Shri Justice A.M. Khanwilkar" },
    { id: 85,  name: "Shri Justice Lingappa Narayana Swamy" },
    { id: 86,  name: "Shri Justice Sanjay Yadav" },
    { id: 87,  name: "Shri Sushil Chandra" },
    { id: 88,  name: "Shri Justice Ritu Raj Awasthi" },
    { id: 89,  name: "Shri Pankaj Kumar" },
    { id: 90,  name: "Shri Ajay Tirkey" },
];

const judgeNameById = (id) =>
    JUDGES.find((j) => String(j.id) === String(id))?.name ?? `User ${id}`;

export default function ShareDocModal({ doc, onClose }) {
    const [shares, setShares] = useState([]);
    const [sharesLoading, setSharesLoading] = useState(true);
    const [sharing, setSharing] = useState(false);
    const [error, setError] = useState("");
    const overlayRef = useRef(null);

    useEffect(() => {
        setSharesLoading(true);
        api.listDocShares(doc.id)
            .then((res) => setShares(res.data ?? []))
            .catch(() => {})
            .finally(() => setSharesLoading(false));
    }, [doc.id]);

    useEffect(() => {
        const handler = (e) => { if (e.target === overlayRef.current) onClose(); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    // Current user id from URL (same logic as api.js)
    const params = new URLSearchParams(window.location.search);
    const currentUserId = String(params.get("user_id") || params.get("uid") || "");

    // Only show judges that are not the current user
    const availableJudges = JUDGES.filter((j) => String(j.id) !== currentUserId);

    const handleShare = async (judge) => {
        if (sharing) return;
        if (shares.some((s) => String(s.shared_with) === String(judge.id))) {
            setError(`Already shared with ${judge.name}.`);
            return;
        }
        setSharing(true);
        setError("");
        try {
            const res = await api.shareDocPage(doc.id, String(judge.id));
            setShares((prev) => [...prev, res.data]);
        } catch {
            setError("Failed to share. Try again.");
        } finally {
            setSharing(false);
        }
    };

    const handleRevoke = async (sharedWith) => {
        try {
            await api.revokeDocShare(doc.id, sharedWith);
            setShares((prev) => prev.filter((s) => s.shared_with !== sharedWith));
        } catch {
            setError("Failed to revoke.");
        }
    };

    return (
        <div
            ref={overlayRef}
            style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
                zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center",
            }}
        >
            <div style={{
                background: "#fff", borderRadius: 12, padding: "24px 24px 20px",
                width: 420, maxWidth: "92vw",
                boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
                display: "flex", flexDirection: "column", gap: 14,
            }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Share document</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>"{doc.title}"</div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}
                    >×</button>
                </div>

                {/* Judge list */}
                <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
                        Share with
                    </div>
                    {availableJudges.map((judge) => {
                        const alreadyShared = shares.some((s) => String(s.shared_with) === String(judge.id));
                        return (
                            <div key={judge.id} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "7px 0", borderBottom: "1px solid #f3f4f6",
                            }}>
                                <span style={{ fontSize: 13, color: "#374151" }}>{judge.name}</span>
                                {alreadyShared ? (
                                    <span style={{
                                        fontSize: 11, padding: "2px 8px", borderRadius: 10,
                                        background: "#dcfce7", color: "#166534", fontWeight: 600,
                                    }}>Shared</span>
                                ) : (
                                    <button
                                        onClick={() => handleShare(judge)}
                                        disabled={sharing}
                                        style={{
                                            fontSize: 12, padding: "3px 10px", borderRadius: 6,
                                            border: "1px solid #3b82f6", background: "none",
                                            color: "#3b82f6", cursor: sharing ? "not-allowed" : "pointer",
                                            fontWeight: 600,
                                        }}
                                    >
                                        Share
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {error && (
                    <div style={{ fontSize: 12, color: "#ef4444" }}>{error}</div>
                )}

                {/* Current shares */}
                <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>
                        {sharesLoading ? "Loading…" : shares.length === 0 ? "Not shared with anyone" : "Shared with"}
                    </div>
                    {shares.map((s) => (
                        <div key={s.shared_with} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13,
                        }}>
                            <span style={{ color: "#374151" }}>{judgeNameById(s.shared_with)}</span>
                            <button
                                onClick={() => handleRevoke(s.shared_with)}
                                style={{
                                    border: "none", background: "none", color: "#ef4444",
                                    cursor: "pointer", fontSize: 12, fontWeight: 600,
                                }}
                            >
                                Revoke
                            </button>
                        </div>
                    ))}
                </div>

                <div style={{ fontSize: 11, color: "#9ca3af", borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>
                    
                </div>
            </div>
        </div>
    );
}
