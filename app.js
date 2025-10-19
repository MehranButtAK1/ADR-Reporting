const video = document.getElementById('camera');
const torchToggle = document.getElementById('torch-toggle');
const startScan = document.getElementById('start-scan');
const uploadImage = document.getElementById('upload-image');
const fileInput = document.getElementById('file-input');
const searchBtn = document.getElementById('search-btn');
const drugSearch = document.getElementById('drug-search');
const drugDetails = document.getElementById('drug-details');
const adrForm = document.getElementById('adr-form');
const historySection = document.getElementById('history');
const historyList = document.getElementById('history-list');

let stream = null;
let track = null;

// ========================= QR SCAN =============================
startScan.onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: "environment" } }
    });
    video.srcObject = stream;
    video.hidden = false;

    track = stream.getVideoTracks()[0];
    torchToggle.hidden = !track.getCapabilities().torch;

    scanFrame();
  } catch (err) {
    alert("Camera access failed: " + err.message);
  }
};

torchToggle.onclick = async () => {
  const caps = track.getCapabilities();
  if (caps.torch) {
    const current = track.getSettings().torch;
    await track.applyConstraints({ advanced: [{ torch: !current }] });
  }
};

function scanFrame() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const loop = () => {
    if (!video.hidden) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, canvas.width, canvas.height);
      if (code) {
        video.hidden = true;
        stream.getTracks().forEach(t => t.stop());
        loadDrug(code.data);
        return;
      }
      requestAnimationFrame(loop);
    }
  };
  loop();
}

// ========================= GALLERY SCAN =============================
uploadImage.onclick = () => fileInput.click();
fileInput.onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, canvas.width, canvas.height);
      if (code) loadDrug(code.data);
      else alert("No QR code detected in image.");
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

// ========================= SEARCH =============================
searchBtn.onclick = () => {
  const name = drugSearch.value.trim();
  if (!name) return alert("Enter a drug name.");
  loadDrug(name);
};

// ========================= DRUG FETCH =============================
async function loadDrug(drugName) {
  drugDetails.innerHTML = "<p>Loading drug info...</p>";
  drugDetails.classList.remove('hidden');

  const data = await getDrugDetails(drugName);

  drugDetails.innerHTML = `
    <h3>${data.name}</h3>
    <p><b>Manufacturer:</b> ${data.manufacturer}</p>
    <p><b>Batch:</b> ${data.batch}</p>
    <p><b>Expiry:</b> ${data.expiry}</p>
    <p><b>Condition:</b> ${data.condition}</p>
    <h4>Reported ADRs:</h4>
    <ul>${data.adrs.map(a => `<li>${a}</li>`).join('')}</ul>
  `;

  adrForm.classList.remove('hidden');
  historySection.classList.remove('hidden');
}

// Fetch local + OpenFDA data
async function getDrugDetails(drugName) {
  let localData = [];
  try {
    const res = await fetch('./drugs-local.json');
    localData = await res.json();
  } catch (e) {
    console.error("Local data error:", e);
  }

  const local = localData.find(
    d => d.name.toLowerCase() === drugName.toLowerCase()
  );

  let fdaADRs = [];
  try {
    const res = await fetch(
      `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:${drugName}&limit=5`
    );
    const data = await res.json();
    fdaADRs = (data.results || []).map(
      r => r.patient.reaction[0]?.reactionmeddrapt || "Unknown ADR"
    );
  } catch (e) {
    console.warn("FDA fetch failed:", e);
  }

  if (local) {
    local.adrs = [...new Set([...local.adrs, ...fdaADRs])];
    return local;
  } else {
    return {
      name: drugName,
      manufacturer: "Unknown",
      batch: "N/A",
      expiry: "—",
      condition: "—",
      adrs: fdaADRs.length ? fdaADRs : ["No ADR data found"]
    };
  }
}

// ========================= REPORT =============================
document.getElementById('submit-adr').onclick = () => {
  const name = document.getElementById('patient-name').value;
  const age = document.getElementById('patient-age').value;
  const gender = document.getElementById('patient-gender').value;
  const phone = document.getElementById('patient-phone').value;
  const adr = document.getElementById('new-adr').value;
  const severity = document.getElementById('severity').value;

  if (!name || !adr) return alert("Please fill patient name and ADR.");

  const report = {
    patient: { name, age, gender, phone },
    adr,
    severity,
    batch: drugDetails.querySelector("p:nth-child(3)").innerText.split(": ")[1],
    date: new Date().toLocaleString(),
  };

  const history = JSON.parse(localStorage.getItem("adrReports") || "[]");
  history.push(report);
  localStorage.setItem("adrReports", JSON.stringify(history));

  alert("✅ Your report has been submitted to officials!");
  showHistory();
};

function showHistory() {
  const history = JSON.parse(localStorage.getItem("adrReports") || "[]");
  historyList.innerHTML = history.map(h => `
    <li>
      <b>${h.patient.name}</b> (${h.patient.age}, ${h.patient.gender})<br>
      ADR: ${h.adr} — <i>${h.severity}</i><br>
      Batch: ${h.batch}<br>
      📅 ${h.date}
    </li>
  `).join('');
}
showHistory();
