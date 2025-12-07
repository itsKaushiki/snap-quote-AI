import React, { useRef, useState } from "react";
import "./index.css";

const API_BASE = "http://127.0.0.1:8080";

const angleLabels = {
  front: "Front",
  rear: "Rear",
  left: "Left",
  right: "Right",
  interior: "Interior"
};

const angleIcons = {
  front: "🚗",
  rear: "🔙",
  left: "⬅️",
  right: "➡️",
  interior: "🪑"
};

function formatCurrency(amount) {
  if (amount === undefined || amount === null) return "₹0";
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const lakhs = abs / 100000;
  if (lakhs >= 1) {
    return sign + "₹" + lakhs.toFixed(2) + "L";
  }
  return sign + "₹" + abs.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const mockLeads = [
  { id: "C-1024", name: "Aarav Sharma", car: "Hyundai Creta 2020", valueRange: "₹5.55L – 5.75L", status: "Booked", risk: "Low" },
  { id: "C-1025", name: "Riya Patel", car: "Maruti Baleno 2018", valueRange: "₹4.10L – 4.30L", status: "New", risk: "Medium" },
  { id: "C-1026", name: "Karan Mehta", car: "Honda City 2016", valueRange: "₹5.00L – 5.20L", status: "Reviewed", risk: "High" }
];

const mockChatMessages = [
  { role: "assistant", text: "Hi! I'm here to help with your car valuation. Ask me anything!" }
];

function useCoverage(captures) {
  const totalAngles = Object.keys(captures).length;
  const filled = Object.values(captures).filter((c) => c.uploadedFilename).length;
  const pct = Math.round((filled / totalAngles) * 100);
  return { percentage: pct, filled, totalAngles };
}

function getMileagePenalty(kms, basePrice) {
  if (kms <= 20000) return null;

  let scoreDelta = 0;
  let pct = 0;

  if (kms <= 40000) {
    scoreDelta = -3;
    pct = 0.02; // 2%
  } else if (kms <= 80000) {
    scoreDelta = -7;
    pct = 0.05; // 5%
  } else {
    scoreDelta = -12;
    pct = 0.10; // 10%
  }

  return {
    scoreDelta,
    valueDelta: -Math.round(basePrice * pct)
  };
}

const App = () => {
  const [mode, setMode] = useState("customer");
  const [captures, setCaptures] = useState({
    front: {},
    rear: {},
    left: {},
    right: {},
    interior: {}
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [car, setCar] = useState("");
  const [year, setYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadingAngle, setUploadingAngle] = useState(null);
  const [error, setError] = useState(null);
  const [selectedLeadId, setSelectedLeadId] = useState("C-1024");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState(mockChatMessages);
  const [chatInput, setChatInput] = useState("");
  const [engineClipName, setEngineClipName] = useState("");
  const [engineResult, setEngineResult] = useState(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const audioInputRef = useRef(null);

  const coverage = useCoverage(captures);
  const canAnalyze = coverage.filled > 0; // Allow analyze if at least 1 image

  async function handleFileChange(angle, file) {
    try {
      setError(null);
      setAnalysis(null);
      if (!file) {
        setCaptures((prev) => ({ ...prev, [angle]: {} }));
        return;
      }
      const localUrl = URL.createObjectURL(file);
      setUploadingAngle(angle);

      // Upload to AutoFix AI backend
      const formData = new FormData();
      formData.append("image", file);
      formData.append("name", name || "Unknown");
      formData.append("model", car || "Unknown");
      formData.append("year", year || "2020");

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Upload failed: ${errText}`);
      }
      
      const data = await res.json();
      
      setCaptures((prev) => ({
        ...prev,
        [angle]: {
          file,
          url: localUrl,
          uploadedFilename: data.filename
        }
      }));
    } catch (err) {
      console.error(err);
      setError(err.message || "Upload failed. Please try another image.");
    } finally {
      setUploadingAngle(null);
    }
  }

  async function handleAnalyze() {
    try {
      setError(null);
      setIsAnalyzing(true);
      
      // 1. Run detection on all uploaded images
      const imagesToProcess = Object.entries(captures).filter(([k, v]) => v.uploadedFilename);
      if (imagesToProcess.length === 0) {
        throw new Error("No images uploaded to analyze");
      }

      let allDetections = [];
      let analyzedImages = [];

      for (const [angle, capture] of imagesToProcess) {
        const detectRes = await fetch(`${API_BASE}/api/detect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: capture.uploadedFilename })
        });
        
        if (!detectRes.ok) throw new Error(`Detection failed for ${angle}`);
        const detectData = await detectRes.json();
        
        // Map backend parts to detections format expected by UI
        const currentDetections = (detectData.parts || []).map(p => ({
          damageType: "Damage", // Backend doesn't give type yet, assume generic
          part: p,
          confidence: 0.9,
          areaPct: 5.0
        }));
        
        allDetections = [...allDetections, ...detectData.parts];

        analyzedImages.push({
          imageId: capture.uploadedFilename,
          angle: angle,
          imageUrl: capture.url,
          heatmapUrl: null, // No heatmaps in this backend
          detections: currentDetections,
          interiorCondition: angle === "interior" ? "good" : "none"
        });
      }

      // 2. Estimate Cost
      const estimateRes = await fetch(`${API_BASE}/api/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carName: name || "Generic",
          carModel: car || "Car",
          carYear: year || "2020",
          detectedParts: allDetections.length > 0 ? allDetections : ["bumper"] // Fallback if no parts
        })
      });

      if (!estimateRes.ok) throw new Error("Cost estimation failed");
      const estimateData = await estimateRes.json();

      // 3. Fetch Base Price from Backend
      const basePriceRes = await fetch(`${API_BASE}/api/estimate/base-price?model=${encodeURIComponent(car)}&year=${encodeURIComponent(year)}`);
      let basePriceData = { basePrice: 500000 }; // Default fallback
      if (basePriceRes.ok) {
        basePriceData = await basePriceRes.json();
      }

      // 4. Calculate Adjustments & Valuation
      const modelBase = basePriceData.basePrice;
      
      let adjustments = estimateData.costBreakdown.map(c => ({
         label: `Repair: ${c.part}`,
         category: "exterior",
         scoreDelta: -10,
         valueDelta: -c.cost
      }));

      // Mileage Deduction Logic
      const kms = parseInt(mileage) || 0;
      const milPenalty = getMileagePenalty(kms, modelBase);
      if (milPenalty) {
          adjustments.push({
              label: `Mileage Adjustment (${kms.toLocaleString()} km)`,
              category: "mileage",
              scoreDelta: milPenalty.scoreDelta,
              valueDelta: milPenalty.valueDelta
          });
      }

      // Interior Wear Analysis via Gemini Vision (backend)
      const interiorImage = analyzedImages.find(img => img.angle === "interior");
      if (interiorImage) {
          try {
              const interiorRes = await fetch(`${API_BASE}/api/interior`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                      filename: interiorImage.imageId || interiorImage.uploadedFilename,
                      basePrice: modelBase
                  })
              });
              if (interiorRes.ok) {
                  const data = await interiorRes.json();
                  adjustments.push({
                      label: `Interior: ${data.condition}`,
                      category: "interior",
                      scoreDelta: data.scoreDelta,
                      valueDelta: data.valueDelta
                  });
                  interiorImage.interiorCondition = data.condition;
              } else {
                  interiorImage.interiorCondition = "moderate";
              }
          } catch (err) {
              interiorImage.interiorCondition = "moderate";
          }
      }

      // Calculate Totals
      const totalDeductions = adjustments.reduce((sum, adj) => sum + adj.valueDelta, 0); // these are negative
      const finalVal = modelBase + totalDeductions;

      // 5. Construct Analysis Result
      const result = {
        sessionId: "session-" + Date.now(),
        images: analyzedImages,
        summary: {
          exteriorDamageScore: Math.max(0, 100 - (allDetections.length * 10)),
          interiorScorePenalty: interiorImage && interiorImage.interiorCondition === "moderate" ? 15 : 0,
          conditionScore: 85
        },
        valuation: {
          basePrice: modelBase,
          dealerFactor: 1.0,
          effectiveBase: modelBase,
          adjustments: adjustments,
          preliminaryValue: finalVal,
          valueRange: { 
             min: finalVal - 10000, 
             max: finalVal + 10000 
          }
        }
      };

      setAnalysis(result);

    } catch (err) {
      console.error(err);
      setError(err.message || "Analyze failed");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleAudioFile(file) {
    if (!file) {
      setEngineClipName("");
      return;
    }
    setEngineClipName(file.name);
    setError(null);
    setIsUploadingAudio(true);
    
    // Mock audio analysis
    setTimeout(() => {
        setEngineResult({
            score: 88,
            classification: "Healthy Idle",
            spectrogram: null
        });
        setIsUploadingAudio(false);
    }, 2000);
  }

  function resetFlow() {
    setCaptures({ front: {}, rear: {}, left: {}, right: {}, interior: {} });
    setName("");
    setPhone("");
    setCar("");
    setYear("");
    setMileage("");
    setAnalysis(null);
    setEngineResult(null);
    setEngineClipName("");
  }

  async function handleSendChat() {
    if (!chatInput.trim()) return;
    
    const userMsg = { role: "user", text: chatInput };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    
    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: userMsg.text, context: analysis })
        });
        const data = await res.json();
        
        setChatMessages((prev) => [...prev, { role: "assistant", text: data.answer }]);

    } catch (err) {
        setChatMessages((prev) => [...prev, { role: "assistant", text: "Sorry, I'm having trouble right now." }]);
    }
  }

  const selectedLead = mockLeads.find((l) => l.id === selectedLeadId) || mockLeads[0];

  return (
    <div className="app-root">
      <div className="app-shell">
        <header className="app-header">
          <div>
            <div className="app-title">
              <span>Snap & Quote</span>
              <span className="app-badge">AI Assistant</span>
            </div>
            <div className="app-subtitle">Get your car's value in minutes</div>
          </div>
          <div className="app-toggle-group">
            <button className={"app-toggle" + (mode === "customer" ? " active" : "")} onClick={() => setMode("customer")}>
              👤 Customer
            </button>
            <button className={"app-toggle" + (mode === "dealer" ? " active" : "")} onClick={() => setMode("dealer")}>
              🏪 Dealer
            </button>
          </div>
        </header>

        <main className="app-layout">
          <section>
            {mode === "customer" ? (
              <CustomerSide
                captures={captures}
                onFileChange={handleFileChange}
                coverage={coverage.percentage}
                name={name}
                phone={phone}
                car={car}
                year={year}
                mileage={mileage}
                setName={setName}
                setPhone={setPhone}
                setCar={setCar}
                setYear={setYear}
                setMileage={setMileage}
                canAnalyze={canAnalyze}
                onAnalyze={handleAnalyze}
                hasValuation={!!analysis}
                resetFlow={resetFlow}
                uploadingAngle={uploadingAngle}
                analyzing={isAnalyzing}
                engineClipName={engineClipName}
                onPickEngineAudio={() => audioInputRef.current?.click()}
                audioInputRef={audioInputRef}
                onAudioFile={handleAudioFile}
                engineResult={engineResult}
                isUploadingAudio={isUploadingAudio}
              />
            ) : (
              <DealerSide selectedLead={selectedLead} setSelectedLeadId={setSelectedLeadId} />
            )}
            {error && <div className="error-banner">{error}</div>}
          </section>

          <section>
            <DamageAndValuationSide
              hasValuation={!!analysis || mode === "dealer"}
              analysis={analysis}
              isAnalyzing={isAnalyzing}
            />
          </section>
        </main>

        <section className="contact-section">
          <div className="contact-inner">
            <h3>Get in Touch</h3>
            <p>Have questions? We're here to help with your car valuation journey.</p>
            <div className="contact-grid">
              <div className="contact-card">
                <span className="contact-icon">📧</span>
                <span className="contact-label">Email</span>
                <span className="contact-value">support@snapquote.in</span>
              </div>
              <div className="contact-card">
                <span className="contact-icon">📞</span>
                <span className="contact-label">Phone</span>
                <span className="contact-value">+91 98765 43210</span>
              </div>
              <div className="contact-card">
                <span className="contact-icon">📍</span>
                <span className="contact-label">Location</span>
                <span className="contact-value">Bangalore, India</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="app-footer">
        <span>Team Three Musketeers · Tekion TekQubit</span>
      </footer>

      <button className="chat-fab" onClick={() => setChatOpen(!chatOpen)}>
        {chatOpen ? "✕" : "💬"}
      </button>

      {chatOpen && (
        <div className="chat-modal">
          <div className="chat-modal-header">
            <span>🤖 AI Assistant</span>
            <button className="chat-close" onClick={() => setChatOpen(false)}>✕</button>
          </div>
          <div className="chat-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              className="chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about your valuation..."
              onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
            />
            <button className="chat-send" onClick={handleSendChat}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
};

const CustomerSide = ({
  captures,
  onFileChange,
  coverage,
  name,
  phone,
  car,
  year,
  mileage,
  setName,
  setPhone,
  setCar,
  setYear,
  setMileage,
  canAnalyze,
  onAnalyze,
  hasValuation,
  resetFlow,
  uploadingAngle,
  analyzing,
  engineClipName,
  onPickEngineAudio,
  audioInputRef,
  onAudioFile,
  engineResult,
  isUploadingAudio
}) => {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">📸 Capture Your Car</div>
          <div className="card-subtitle">Take photos from different angles for instant AI analysis</div>
        </div>
      </div>
      <div className="card-body">
        <div className="capture-grid">
          {Object.keys(captures).map((angle) => {
            const c = captures[angle];
            const hasFile = Boolean(c.file || c.uploadedFilename);
            const isUploading = uploadingAngle === angle;
            return (
              <label key={angle} className={"capture-tile" + (hasFile ? " captured" : "")}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    onFileChange(angle, file);
                    e.target.value = "";
                  }}
                />
                <span className="capture-emoji">{angleIcons[angle]}</span>
                <span className="capture-label">{angleLabels[angle]}</span>
                <span className={"capture-status" + (hasFile ? " done" : "")}>
                  {isUploading ? "..." : hasFile ? "✓" : "Tap"}
                </span>
              </label>
            );
          })}
        </div>

        <div className="progress-block">
          <div className="progress-bar-shell">
            <div className="progress-fill" style={{ width: `${coverage}%` }} />
          </div>
          <span className="progress-text">{coverage}% complete</span>
        </div>

        <div className="form-section">
          <div className="card-title">🔊 Engine Sound Analysis</div>
          <div className="card-subtitle" style={{ marginBottom: 8 }}>
            Photos show the exterior; sound reveals hidden mechanical health (knock, misfire, bearings).
          </div>
          <div className="audio-upload-row">
            <button className="secondary-button" onClick={onPickEngineAudio} disabled={isUploadingAudio}>
              {isUploadingAudio ? "Analyzing..." : "🎙️ Record / Upload engine sound"}
            </button>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                onAudioFile(file);
                e.target.value = "";
              }}
            />
            <span className="audio-hint" style={{ marginLeft: 10, fontSize: 13, color: '#a1a1aa' }}>
              {engineClipName ? `Attached: ${engineClipName}` : " clip of ~10s"}
            </span>
          </div>
          
          {engineResult && (
              <div className="engine-result-card">
                  <div className="engine-score-row">
                      <span className="engine-label">Health Score:</span>
                      <span className={"engine-value " + (engineResult.score > 60 ? "good" : "bad")}>
                          {engineResult.score}/100
                      </span>
                  </div>
                  <div className="engine-class">
                      Classification: <strong>{engineResult.classification}</strong>
                  </div>
              </div>
          )}
        </div>

        <div className="form-section">
          <div className="card-title">📝 Your Details</div>
          <div className="form-grid">
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" />
            <input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile (+91)" />
            <input className="form-input" value={car} onChange={(e) => setCar(e.target.value)} placeholder="Car Model (e.g. Hyundai Creta)" />
            <input className="form-input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" />
            <input className="form-input full-width" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="Odometer (km)" />
          </div>

          <div className="button-row">
            <button className="primary-button" disabled={!canAnalyze || analyzing} onClick={onAnalyze}>
              {analyzing ? "Analyzing..." : hasValuation ? "🔄 Re-run analysis" : "⚡ Analyze"}
            </button>
            <button className="secondary-button" onClick={resetFlow}>↺ Reset</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DealerSide = ({ selectedLead, setSelectedLeadId }) => {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">📋 Lead Queue</div>
          <div className="card-subtitle">Review incoming valuations</div>
        </div>
      </div>
      <div className="card-body">
        <div className="dealer-list">
          {mockLeads.map((lead) => (
            <button
              key={lead.id}
              className={"dealer-lead-row" + (lead.id === selectedLead.id ? " active" : "")}
              onClick={() => setSelectedLeadId(lead.id)}
            >
              <div className="dealer-lead-main">
                <span className="dealer-lead-name">{lead.car}</span>
                <span className="dealer-lead-meta">{lead.name}</span>
              </div>
              <div className="dealer-lead-value">
                <span className="lead-price">{lead.valueRange}</span>
                <div className="lead-badges">
                  <span className={"lead-badge " + lead.status.toLowerCase()}>{lead.status}</span>
                  <span className={"lead-badge risk-" + lead.risk.toLowerCase()}>{lead.risk}</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="selected-lead-box">
          <div className="card-title">🚗 {selectedLead.car}</div>
          <div className="lead-details">
            <span className="lead-price-big">{selectedLead.valueRange}</span>
            <span className="lead-owner">Owner: {selectedLead.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const DamageAndValuationSide = ({
  hasValuation,
  analysis,
  isAnalyzing
}) => {
  const fallbackValuation = {
    basePrice: 0,
    dealerFactor: 1.0,
    effectiveBase: 0,
    adjustments: [],
    preliminaryValue: 0,
    valueRange: { min: 0, max: 0 }
  };

  const valuation = analysis?.valuation || fallbackValuation;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">🔍 AI Analysis</div>
          <div className="card-subtitle">Damage detection & valuation</div>
        </div>
        {isAnalyzing && <span className="badge-soft" style={{color: '#6366f1', fontSize: '13px'}}>Analyzing...</span>}
      </div>
      <div className="card-body">
        <div className="heatmap-section">
          {analysis ? (
            <div className="heatmap-grid">
              {analysis.images.map((img) => (
                <div key={img.imageId} className="heatmap-card">
                  <div className="heatmap-header">
                    <span>{angleLabels[img.angle]}</span>
                    <span className="chip">{img.interiorCondition !== "none" ? `Interior: ${img.interiorCondition}` : "Exterior"}</span>
                  </div>
                  {img.heatmapUrl ? (
                    <img src={img.heatmapUrl} alt={`${img.angle} heatmap`} className="heatmap-img" />
                  ) : (
                    img.imageUrl ? (
                        <img src={img.imageUrl} alt={`${img.angle} source`} className="heatmap-img" />
                    ) : (
                        <div className="heatmap-placeholder">No Image</div>
                    )
                  )}
                  <div className="detection-chips">
                    {img.detections.length === 0 && <span className="chip">No exterior damage</span>}
                    {img.detections.map((d, i) => (
                      <span key={i} className="chip-strong">
                        {d.part}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="car-heatmap-shell">
              <div className="car-heatmap-car">
                <div className="car-body-outline" />
                <div className="car-wheel left" />
                <div className="car-wheel right" />
                <div className="car-heat-blob dent front-bumper" />
                <div className="car-heat-blob scratch left-door" />
              </div>
              <div className="heatmap-legend">
                <span className="legend-item dent">● Dent</span>
                <span className="legend-item scratch">● Scratch</span>
              </div>
            </div>
          )}
        </div>

        <div className="valuation-section">
          <div className="valuation-title">💰 Cost & Value Breakdown</div>
          <div className="valuation-list">
            <div className="valuation-item base">
              <span>Base price</span>
              <span>{formatCurrency(valuation.basePrice)}</span>
            </div>
            {valuation.adjustments.map((item, i) => (
              <div key={i} className={"valuation-item " + (item.valueDelta < 0 ? "deduction" : "bonus")}>
                <span>{item.label}</span>
                <span>{item.valueDelta < 0 ? "" : "+"}{formatCurrency(item.valueDelta)}</span>
              </div>
            ))}
          </div>
          <div className="valuation-total">
            <span>Final preliminary value</span>
            <span className="total-price">
              {formatCurrency(valuation.valueRange.min)} – {formatCurrency(valuation.valueRange.max)}
            </span>
          </div>
          {!hasValuation && (
            <div className="chat-hint" style={{ marginTop: 10, fontSize: '13px', color: '#71717a' }}>
              <span>Upload angles and hit Analyze to see your real breakdown.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
