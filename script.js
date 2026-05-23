const BACKEND_URL = "http://127.0.0.1:8000/chat/stream";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const canUseTTS = "speechSynthesis" in window;

const chatMain       = document.getElementById("chatMain");
const historyList    = document.getElementById("historyList");
const userInput      = document.getElementById("userInput");
const userType       = document.getElementById("userType");
const speakToggle    = document.getElementById("speakToggle");
const themeToggleBtn = document.getElementById("themeToggle");
const sendBtn        = document.getElementById("sendBtn");

let messages  = [];
let isLoading = false;

const saved = localStorage.getItem("chat_history");
if (saved) { try { messages = JSON.parse(saved); } catch { messages = []; } }

function nowTime() {
  return new Date().toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function getClinicalSectionIcon(title) {
  const t = String(title || "").toLowerCase();

  if (t.includes("σύντομη") || t.includes("σύνοψη")) return "🧾";
  if (t.includes("ελλην")) return "🇬🇷";
  if (t.includes("esc") || t.includes("ευρωπαϊ")) return "🇪🇺";
  if (t.includes("acc") || t.includes("aha") || t.includes("hrs") || t.includes("αμερικαν")) return "🇺🇸";
  if (t.includes("σύγκρι") || t.includes("κοινό") || t.includes("διαφέρ")) return "⚖️";
  if (t.includes("προσοχή") || t.includes("σαφές") || t.includes("περιορισ")) return "⚠️";
  if (t.includes("πηγ")) return "📚";

  return "💠";
}

function normalizeClinicalHeadings(text) {
  return String(text || "")
    // Μετατρέπει αριθμημένες ενότητες τύπου "1. Σύνοψη" σε markdown headings.
    .replace(/(^|\n)\s*(\d{1,2})\.\s+(Σύντομη Απάντηση|Σύνοψη|Τι Είναι\s*[—-]\s*Ορισμός|Τι λένε τα Ελληνικά Πρωτόκολλα|Τι Λένε τα Ελληνικά Πρωτόκολλα|Ελληνικά Πρωτόκολλα|Τι λένε οι ESC Guidelines|Τι Λένε οι Διεθνείς Οδηγίες \(ESC\/AHA\)|Τι Λένε οι Διεθνείς Οδηγίες|ESC Guidelines|Τι λένε οι ACC\/AHA\/HRS Guidelines|ACC\/AHA\/HRS Guidelines|Τι Έχουν Κοινό|Πού Διαφέρουν|Σύγκριση|Προσοχή|Τι Σημαίνει Αυτό για τον Ασθενή|Τι Δεν Είναι Σαφές από τα Αποσπάσματα|Πηγές)/gim, "\n### $2. $3")
    // Ενισχύει μη αριθμημένες βασικές επικεφαλίδες.
    .replace(/(^|\n)\s*(Σύνοψη|Ελληνικά Πρωτόκολλα|ESC Guidelines|ACC\/AHA\/HRS Guidelines|Σύγκριση|Προσοχή|Πηγές)\s*$/gim, "\n### $2");
}

function renderMarkdown(text) {
  const clean = normalizeClinicalHeadings(text)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let html = escapeHtml(clean)
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^### (.+)$/gm, (_, title) => {
      const icon = getClinicalSectionIcon(title);
      return `<h4 class="clinical-section-title"><span class="clinical-section-icon">${icon}</span><span>${title}</span></h4>`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^[-•] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>(\n|$))+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g, "<br>")
    .replace(/\n/g, "");

  // Τυλίγει κάθε κλινική ενότητα σε ξεχωριστή κάρτα.
  html = html.replace(
    /<h4 class="clinical-section-title">([\s\S]*?)(?=<h4 class="clinical-section-title">|$)/g,
    '<section class="clinical-answer-card"><h4 class="clinical-section-title">$1</section>'
  );

  return html;
}

/* ══════════════════════════════════════════
   DIAGRAMS — Ακριβείς συντεταγμένες
══════════════════════════════════════════ */
const DIAGRAMS_MAP = [
  {
    keywords: ["εμμένουσα", "μονόμορφη κοιλιακή ταχυκαρδία", "αιμοδυναμική αστάθεια",
      "κοιλιακή ταχυκαρδία αντιμετώπιση", "αντιμετώπιση κοιλιακής ταχυκαρδίας",
      "sustained vt", "κοιλιακή ταχυκαρδία θεραπεία", "προκαϊναμίδη", "αμιωδαρόνη κοιλιακή",
      "οξεία διαχείριση κοιλιακής"],
    image: "diagrams/VA_greek_page6.png",
    caption: "Διάγραμμα 1: Οξεία διαχείριση εμμένουσας μονόμορφης κοιλιακής ταχυκαρδίας",
    steps: [
      { label: "Εμμένουσα μονόμορφη κοιλιακή ταχυκαρδία", coords: "260,60,574,86",
        question: "Τι είναι η εμμένουσα μονόμορφη κοιλιακή ταχυκαρδία;" },
      { label: "Αιμοδυναμική αστάθεια;", coords: "325,127,508,153",
        question: "Τι σημαίνει αιμοδυναμική αστάθεια στην κοιλιακή ταχυκαρδία;" },
      { label: "Ηλεκτρική Καρδιομετατροπή", coords: "625,119,753,164",
        question: "Τι είναι η Ηλεκτρική Καρδιομετατροπή και πότε γίνεται;" },
      { label: "Παρουσία δομικής νόσου;", coords: "169,182,353,222",
        question: "Τι σημαίνει παρουσία ή ισχυρή υποψία δομικής νόσου;" },
      { label: "Χαμηλός αναισθητικός κίνδυνος;", coords: "467,187,618,223",
        question: "Τι σημαίνει χαμηλός αναισθητικός κίνδυνος;" },
      { label: "Ιδιοπαθής", coords: "219,250,314,277",
        question: "Τι είναι οι ιδιοπαθείς κοιλιακές ταχυκαρδίες;" },
      { label: "Λοιπές εντοπίσεις", coords: "385,252,503,278",
        question: "Τι είναι οι κοιλιακές ταχυκαρδίες από λοιπές εντοπίσεις;" },
      { label: "Δεσμιδική", coords: "162,303,251,322",
        question: "Τι είναι η δεσμιδική κοιλιακή ταχυκαρδία;" },
      { label: "Χώρος εξόδου", coords: "253,303,349,323",
        question: "Τι είναι η κοιλιακή ταχυκαρδία από τον χώρο εξόδου;" },
      { label: "Βεραπαμίλη (Ι)", coords: "129,353,235,376",
        question: "Πότε χρησιμοποιείται η Βεραπαμίλη στην κοιλιακή ταχυκαρδία;" },
      { label: "Β-αναστολείς (Ι)", coords: "252,353,363,376",
        question: "Πότε χρησιμοποιούνται οι Β-αναστολείς στην κοιλιακή ταχυκαρδία;" },
      { label: "Προκαϊναμίδη (ΙΙΑ) — Λοιπές εντοπίσεις", coords: "376,300,504,324",
        question: "Τι είναι η Προκαϊναμίδη και ποια είναι η ένδειξή της;" },
      { label: "Φλεκαΐνίδη / Αζμαλίνη / Σοταλόλη / Αμιωδαρόνη (ΙΙΒ)", coords: "376,333,506,410",
        question: "Πότε χρησιμοποιούνται Φλεκαΐνίδη, Αζμαλίνη, Σοταλόλη, Αμιωδαρόνη;" },
      { label: "Προκαϊναμίδη (ΙΙΑ) — Δομική νόσος", coords: "531,300,658,324",
        question: "Ποια η διαφορά ένδειξης ΙΙΑ vs ΙΙΒ για Προκαϊναμίδη και Αμιωδαρόνη;" },
      { label: "Αμιωδαρόνη (ΙΙΒ)", coords: "531,333,658,356",
        question: "Τι είναι η Αμιωδαρόνη και πότε χορηγείται;" },
    ]
  },
  {
    keywords: ["ηλεκτρική θύελλα", "πολύμορφη κοιλιακή", "electrical storm",
      "brugada", "lqts", "cpvt", "κοιλιακή μαρμαρυγή", "κινιδίνη", "ισοπροτερενόλη",
      "πολύμορφη vt", "ηλεκτρική αστάθεια"],
    image: "diagrams/VA_greek_page8.png",
    caption: "Διάγραμμα 2: Αντιμετώπιση ηλεκτρικής θύελλας από πολύμορφη κοιλιακή ταχυκαρδία",
    steps: [
      { label: "Ηλεκτρική θύελλα από πολύμορφη κοιλιακή ταχυκαρδία", coords: "211,50,595,72",
        question: "Τι είναι η ηλεκτρική θύελλα από πολύμορφη κοιλιακή ταχυκαρδία;" },

      { label: "Πυροδοτούμενη από μονόμορφες εκτακτοσυστολές", coords: "81,104,246,160",
        question: "Τι σημαίνει πυροδότηση πολύμορφης ΚΤ από μονόμορφες εκτακτοσυστολές;" },

      { label: "Επίκτητο LQT", coords: "255,113,344,135",
        question: "Τι είναι το επίκτητο σύνδρομο μακρού QT και πώς αντιμετωπίζεται;" },

      { label: "CPVT / Συγγενές LQTS", coords: "346,113,486,135",
        question: "Τι είναι η CPVT και το συγγενές σύνδρομο LQTS;" },

      { label: "BrS, ERS", coords: "491,113,582,135",
        question: "Τι είναι το σύνδρομο Brugada και το σύνδρομο πρώιμης επαναπόλωσης;" },

      { label: "Ιδιοπαθής VF", coords: "587,113,661,135",
        question: "Τι είναι η ιδιοπαθής κοιλιακή μαρμαρυγή;" },

      { label: "Κατάλυση (ΙΙΑ)", coords: "103,190,226,214",
        question: "Πότε ενδείκνυται η κατάλυση στην ηλεκτρική θύελλα;" },

      { label: "Κινιδίνη (ΙΙΒ)", coords: "103,221,226,244",
        question: "Τι είναι η Κινιδίνη και πότε χορηγείται;" },

      { label: "Απομάκρυνση αιτιολογικών παραγόντων (Ι)", coords: "245,184,351,232",
        question: "Τι σημαίνει απομάκρυνση αιτιολογικών παραγόντων στο επίκτητο LQT;" },

      { label: "Αναπλήρωση καλίου/μαγνησίου (Ι)", coords: "245,237,351,266",
        question: "Πότε γίνεται αναπλήρωση καλίου και μαγνησίου στο επίκτητο LQT;" },

      { label: "Ισοπροτερενόλη (Ι)", coords: "245,270,351,294",
        question: "Πότε χρησιμοποιείται η Ισοπροτερενόλη στο επίκτητο LQT;" },

      { label: "Βηματοδότηση (Ι) — Επίκτητο LQT", coords: "245,300,351,324",
        question: "Πότε χρειάζεται βηματοδότηση στο επίκτητο LQT;" },

      { label: "Β-αναστολείς (Ι)", coords: "360,185,466,208",
        question: "Ποιος ο ρόλος των Β-αναστολέων στη CPVT;" },

      { label: "Βηματοδότηση (Ι)", coords: "360,215,466,239",
        question: "Τι είναι η βηματοδότηση στη CPVT/LQTS;" },

      { label: "Αναπλήρωση καλίου/μαγνησίου (Ι) — CPVT/LQTS", coords: "360,244,466,270",
        question: "Πότε γίνεται αναπλήρωση καλίου και μαγνησίου στη CPVT/LQTS;" },

      { label: "Ισοπροτερενόλη (ΙΙΑ) — BrS", coords: "475,183,589,206",
        question: "Τι είναι η Ισοπροτερενόλη και πότε χορηγείται στο σύνδρομο Brugada;" },

      { label: "Κινιδίνη (ΙΙΑ) — BrS", coords: "475,213,589,237",
        question: "Ποια η ένδειξη της Κινιδίνης στο σύνδρομο Brugada;" },

      { label: "Κατάλυση (ΙΙΑ) — BrS", coords: "475,242,589,265",
        question: "Πότε γίνεται κατάλυση στο σύνδρομο Brugada;" },

      { label: "Ισοπροτερενόλη (ΙΙΑ) — Ιδιοπαθής VF", coords: "599,183,719,207",
        question: "Πότε χρησιμοποιείται η Ισοπροτερενόλη στην ιδιοπαθή VF;" },

      { label: "Κινιδίνη (ΙΑ) — Ιδιοπαθής VF", coords: "599,212,719,236",
        question: "Ποια η ένδειξη Κινιδίνης στην ιδιοπαθή κοιλιακή μαρμαρυγή;" },

      { label: "Βεραπαμίλη (ΙΙΑ) — Ιδιοπαθής VF", coords: "599,241,719,265",
        question: "Πότε χρησιμοποιείται η Βεραπαμίλη στην ιδιοπαθή VF;" },

      { label: "Κατάλυση (ΙΙΑ) — Ιδιοπαθής VF", coords: "599,270,719,294",
        question: "Πότε γίνεται κατάλυση στην ιδιοπαθή κοιλιακή μαρμαρυγή;" },
    ]
  },
  {
    keywords: [
      "θεραπευτική διαχείριση κολπικής μαρμαρυγής", "παρακολούθηση κολπικής μαρμαρυγής",
      "θεραπευτική διαχείριση", "αντιπηκτική αγωγή", "noac κολπική",
      "cha2ds2", "chads",
      "κολπική μαρμαρυγή θεραπεία", "κολπική μαρμαρυγή αντιμετώπιση",
      "κολπική μαρμαρυγή διαχείριση", "κολπική μαρμαρυγή παρακολούθηση",
      "ρυθμός συχνότητα", "rate control", "rhythm control",
      "κατάλυση κολπικής", "αλγόριθμος κολπικής",
      "af management", "af treatment", "αντιθρομβωτική αγωγή"
    ],
    image: "diagrams/AF_patient_simple.png",
    audience: "patient",
    caption: "Κολπική Μαρμαρυγή — Απλός Οδηγός για Ασθενείς",
    steps: [
      { label: "ΒΗΜΑ 1: Επιβεβαίωση διάγνωσης", coords: "163,132,1376,242",
        question: "Πώς επιβεβαιώνεται η κολπική μαρμαρυγή με απλά λόγια;" },
      { label: "ΒΗΜΑ 2: Εκτίμηση κινδύνου εγκεφαλικού", coords: "163,269,1376,379",
        question: "Γιατί ο γιατρός εκτιμά τον κίνδυνο εγκεφαλικού στην κολπική μαρμαρυγή;" },
      { label: "ΒΗΜΑ 3: Αντιπηκτική αγωγή αν χρειάζεται", coords: "163,405,1376,516",
        question: "Τι είναι τα αντιπηκτικά φάρμακα και πότε μπορεί να χρειάζονται;" },
      { label: "ΒΗΜΑ 4: Έλεγχος παλμών ή ρυθμού", coords: "163,533,1376,650",
        question: "Τι σημαίνει έλεγχος παλμών και τι σημαίνει έλεγχος ρυθμού;" },
      { label: "ΒΗΜΑ 5: Παράγοντες κινδύνου", coords: "163,668,1376,777",
        question: "Ποιοι παράγοντες κινδύνου επηρεάζουν την κολπική μαρμαρυγή;" },
      { label: "ΒΗΜΑ 6: Τακτική παρακολούθηση", coords: "163,794,1376,908",
        question: "Γιατί χρειάζεται τακτική παρακολούθηση στην κολπική μαρμαρυγή;" },
    ]
  },
  {
    keywords: [
      "θεραπευτική διαχείριση κολπικής μαρμαρυγής", "παρακολούθηση κολπικής μαρμαρυγής",
      "θεραπευτική διαχείριση", "αντιπηκτική αγωγή", "noac κολπική",
      "cha2ds2", "chads",
      "κολπική μαρμαρυγή θεραπεία", "κολπική μαρμαρυγή αντιμετώπιση",
      "κολπική μαρμαρυγή διαχείριση", "κολπική μαρμαρυγή παρακολούθηση",
      "ρυθμός συχνότητα", "rate control", "rhythm control",
      "κατάλυση κολπικής", "αλγόριθμος κολπικής",
      "af management", "af treatment", "αντιθρομβωτική αγωγή"
    ],
    image: "diagrams/AF_doctor_advanced.png",
    audience: "doctor",
    caption: "Κολπική Μαρμαρυγή — Κλινικός Αλγόριθμος για Γιατρούς",
    steps: [
      { label: "ΒΗΜΑ 1: Διάγνωση Κολπικής Μαρμαρυγής", coords: "132,110,1348,204",
        question: "Πώς γίνεται η διάγνωση της κολπικής μαρμαρυγής; Τι δείχνει το ΗΚΓ;" },
      { label: "ΒΗΜΑ 2: Κλινική Αξιολόγηση & Διαστρωμάτωση Κινδύνου", coords: "132,220,1348,348",
        question: "Πώς γίνεται η κλινική αξιολόγηση και η διαστρωμάτωση κινδύνου στην κολπική μαρμαρυγή;" },
      { label: "Score 0 — συνήθως χωρίς OAC", coords: "306,306,625,338",
        question: "Τι σημαίνει score 0 σε άνδρα ή 1 σε γυναίκα ως προς την αντιπηκτική αγωγή;" },
      { label: "Score 1 → εξατομίκευση", coords: "635,306,842,338",
        question: "Πότε εξατομικεύεται η απόφαση για αντιπηκτική αγωγή;" },
      { label: "Score ≥2/≥3 → OAC", coords: "866,306,1286,338",
        question: "Πότε υπάρχει ένδειξη για από του στόματος αντιπηκτική αγωγή;" },
      { label: "ΒΗΜΑ 3: Αντιπηκτική Αγωγή", coords: "132,363,1348,446",
        question: "Ποια αντιπηκτικά φάρμακα χρησιμοποιούνται στην κολπική μαρμαρυγή;" },
      { label: "ΒΗΜΑ 4: Στρατηγική Ελέγχου Ρυθμού / Συχνότητας", coords: "132,461,1348,623",
        question: "Πώς επιλέγεται στρατηγική ελέγχου ρυθμού ή συχνότητας στην κολπική μαρμαρυγή;" },
      { label: "Έλεγχος Συχνότητας", coords: "238,496,735,580",
        question: "Τι σημαίνει έλεγχος συχνότητας στην κολπική μαρμαρυγή; Ποια φάρμακα;" },
      { label: "Έλεγχος Ρυθμού", coords: "748,496,1245,580",
        question: "Τι σημαίνει έλεγχος ρυθμού; Πότε γίνεται ανάταξη ή κατάλυση;" },
      { label: "Αιμοδυναμική αστάθεια", coords: "390,588,978,621",
        question: "Τι κάνουμε σε αιμοδυναμική αστάθεια στην κολπική μαρμαρυγή;" },
      { label: "ΒΗΜΑ 5: Αντιμετώπιση Παραγόντων Κινδύνου", coords: "132,640,1348,730",
        question: "Ποιοι παράγοντες κινδύνου επηρεάζουν την κολπική μαρμαρυγή;" },
      { label: "ΒΗΜΑ 6: Τακτική Παρακολούθηση", coords: "132,746,1348,855",
        question: "Πόσο συχνά πρέπει να παρακολουθείται ο ασθενής με κολπική μαρμαρυγή;" },
      { label: "ΒΗΜΑ 7: Επανεκτίμηση", coords: "214,871,1348,943",
        question: "Πότε πρέπει να επανεκτιμάται και να προσαρμόζεται η αγωγή στην κολπική μαρμαρυγή;" },
    ]
  },
  {
    keywords: ["διαχείριση κοιλιακών αρρυθμιών", "αλγόριθμος κοιλιακ",
      "κοιλιακές αρρυθμίες διαχείριση", "κοιλιακές αρρυθμίες θεραπεία",
      "icd ένδειξη", "απινιδωτής ένδειξη", "εμφύτευση απινιδωτή",
      "διαστρωμάτωση κινδύνου", "αιφνίδιος θάνατος πρόληψη",
      "πώς διαχειριζόμαστε", "holter κοιλιακ"],
    image: "diagrams/VA_greek_page3.png",
    caption: "Αλγόριθμος Διαχείρισης Κοιλιακών Αρρυθμιών",
    steps: [
      { label: "Διαχείριση Κοιλιακών Αρρυθμιών", coords: "277,165,604,206",
        question: "Πώς γίνεται γενικά η διαχείριση των κοιλιακών αρρυθμιών;" },

      { label: "Αντιμετώπιση Οξέος Επεισοδίου", coords: "44,217,300,250",
        question: "Πώς αντιμετωπίζεται ένα οξύ επεισόδιο κοιλιακής αρρυθμίας;" },

      { label: "Διερεύνηση Υποκείμενου Νοσήματος", coords: "309,217,587,250",
        question: "Γιατί είναι σημαντική η διερεύνηση υποκείμενου νοσήματος;" },

      { label: "Αποτροπή Υποτροπών", coords: "590,217,846,250",
        question: "Πώς επιτυγχάνεται η αποτροπή υποτροπών στις κοιλιακές αρρυθμίες;" },

      { label: "Αντιαρρυθμική Αγωγή — Οξύ επεισόδιο", coords: "70,259,260,282",
        question: "Ποια αντιαρρυθμικά φάρμακα χρησιμοποιούνται στο οξύ επεισόδιο;" },

      { label: "1ης γραμμής αγωγή", coords: "117,288,231,309",
        question: "Ποια είναι η αγωγή 1ης γραμμής στις κοιλιακές αρρυθμίες;" },

      { label: "2ης γραμμής αγωγή", coords: "117,316,231,337",
        question: "Πότε χρησιμοποιείται η αγωγή 2ης γραμμής;" },

      { label: "Ηλεκτρική Ανάταξη", coords: "70,345,260,367",
        question: "Πότε χρησιμοποιείται η ηλεκτρική ανάταξη στις κοιλιακές αρρυθμίες;" },

      { label: "Κατάλυση — Οξύ επεισόδιο", coords: "70,377,260,399",
        question: "Τι είναι η καθετηριακή κατάλυση και πότε ενδείκνυται;" },

      { label: "Ηλεκτροκαρδιογράφημα", coords: "343,259,532,282",
        question: "Ποιος ο ρόλος του ΗΚΓ στη διερεύνηση κοιλιακών αρρυθμιών;" },

      { label: "Υπερηχοκαρδιογράφημα", coords: "343,289,532,312",
        question: "Τι δείχνει το υπερηχοκαρδιογράφημα στις κοιλιακές αρρυθμίες;" },

      { label: "Δοκιμασία κόπωσης", coords: "343,319,532,342",
        question: "Πότε ενδείκνυται δοκιμασία κόπωσης σε κοιλιακές αρρυθμίες;" },

      { label: "24ωρη καταγραφή Holter", coords: "343,348,532,371",
        question: "Τι είναι η 24ωρη καταγραφή Holter;" },

      { label: "Μαγνητική τομογραφία καρδιάς", coords: "343,377,532,401",
        question: "Πότε ενδείκνυται η μαγνητική τομογραφία καρδιάς;" },

      { label: "Έλεγχος ισχαιμίας / Στεφανιογραφία", coords: "343,405,532,447",
        question: "Πότε χρειάζεται έλεγχος ισχαιμίας στις κοιλιακές αρρυθμίες;" },

      { label: "Γενετικός έλεγχος", coords: "343,453,532,476",
        question: "Πότε ενδείκνυται γενετικός έλεγχος στις κοιλιακές αρρυθμίες;" },

      { label: "Αποτροπή Υποτροπών — Αντιαρρυθμική Αγωγή", coords: "630,259,819,282",
        question: "Ποια φάρμακα χρησιμοποιούνται για αποτροπή υποτροπών;" },

      { label: "1ης γραμμής αγωγή — Αποτροπή υποτροπών", coords: "671,288,785,309",
        question: "Ποια είναι η αγωγή 1ης γραμμής για αποτροπή υποτροπών;" },

      { label: "2ης γραμμής αγωγή — Αποτροπή υποτροπών", coords: "671,316,785,337",
        question: "Πότε χρησιμοποιείται η αγωγή 2ης γραμμής για αποτροπή υποτροπών;" },

      { label: "Κατάλυση — Αποτροπή υποτροπών", coords: "630,345,819,367",
        question: "Πότε γίνεται κατάλυση για αποτροπή υποτροπών;" },

      { label: "Διαστρωμάτωση Κινδύνου Αιφνίδιου Θανάτου", coords: "231,493,644,526",
        question: "Πώς γίνεται η διαστρωμάτωση κινδύνου αιφνίδιου καρδιακού θανάτου;" },

      { label: "Εμφύτευση Απινιδωτή (ICD)", coords: "318,535,556,577",
        question: "Ποιες είναι οι ενδείξεις εμφύτευσης απινιδωτή ICD;" },
    ]
  },
];

function detectDiagram(question, selectedUserType = "patient") {
  const q = question.toLowerCase();

  const matches = DIAGRAMS_MAP.filter(d =>
    d.keywords.some(k => q.includes(k.toLowerCase()))
  );

  if (!matches.length) return null;

  // Αν υπάρχουν 2 διαγράμματα για το ίδιο θέμα, διάλεξε με βάση τον τύπο χρήστη.
  // Ασθενής -> απλό διάγραμμα
  // Γιατρός -> αναλυτικό διάγραμμα
  const preferred = matches.find(d => !d.audience || d.audience === selectedUserType);
  return preferred || matches[0];
}

/* ══════════════════════════════════════════
   GLOBAL TOOLTIP — ακολουθεί το mouse
══════════════════════════════════════════ */
let _globalTooltip = null;

function getGlobalTooltip() {
  if (!_globalTooltip) {
    _globalTooltip = document.createElement("div");
    _globalTooltip.id = "global-diagram-tooltip";
    _globalTooltip.style.cssText = `
      display:none;
      position:fixed;
      background:rgba(10,20,50,0.96);
      color:#93c5fd;
      font-size:10px;
      font-weight:600;
      padding:5px 12px;
      border-radius:6px;
      white-space:nowrap;
      border:1px solid rgba(37,99,235,0.5);
      z-index:99999;
      pointer-events:none;
      box-shadow:0 4px 14px rgba(0,0,0,0.6);
      font-family:Inter,sans-serif;
      transform:translate(-50%, -100%);
    `;
    document.body.appendChild(_globalTooltip);
  }
  return _globalTooltip;
}

/* ══════════════════════════════════════════
   OVERLAY — Ακριβής τοποθέτηση zones
══════════════════════════════════════════ */
window._diagStore = {};


/* ══ Diagram overlay CSS fallback ══ */
(function injectDiagramOverlayCSS() {
  if (document.getElementById("diagram-overlay-fix-style")) return;

  const style = document.createElement("style");
  style.id = "diagram-overlay-fix-style";
  style.textContent = `
    .diagram-image-wrap {
      position: relative;
      display: block;
      margin: 0 auto;
      max-width: 100%;
      line-height: 0;
      width: fit-content;
    }

    .diagram-image-wrap .diagram-img {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 0 auto;
      border-radius: 8px;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .diagram-image-wrap .diagram-img:hover {
      opacity: 0.92;
    }

    .diagram-overlay {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 5;
    }

    #global-diagram-tooltip {
      z-index: 99999 !important;
    }
  `;
  document.head.appendChild(style);
})();



/* ══ UI small fixes: help button + send icon ══ */
(function injectSmallUiFixes() {
  if (document.getElementById("small-ui-fix-style")) return;

  const style = document.createElement("style");
  style.id = "small-ui-fix-style";
  style.textContent = `
    #helpBtn {
      bottom: 90px !important;
      right: 24px !important;
      z-index: 900 !important;
    }

    #sendBtn {
      font-family: Inter, system-ui, sans-serif !important;
      font-weight: 700 !important;
      line-height: 1 !important;
    }

    @media (max-width: 768px) {
      #helpBtn {
        bottom: 105px !important;
        right: 16px !important;
      }
    }
  `;
  document.head.appendChild(style);
})();


function initOverlay(uid) {
  const img = document.getElementById("img-" + uid);
  const ov  = document.getElementById("ov-" + uid);
  const wrap = document.getElementById("wrap-" + uid);

  if (!img || !ov || !wrap) return;

  const diagram = window._diagStore[uid];
  if (!diagram?.steps?.length) return;

  const nw = img.naturalWidth;
  const nh = img.naturalHeight;

  if (!nw || !nh || !img.complete) {
    setTimeout(() => initOverlay(uid), 100);
    return;
  }

  const renderedW = img.clientWidth;
  const renderedH = img.clientHeight;

  if (!renderedW || !renderedH) {
    setTimeout(() => initOverlay(uid), 100);
    return;
  }

  wrap.style.width = renderedW + "px";
  wrap.style.height = renderedH + "px";

  ov.style.width = renderedW + "px";
  ov.style.height = renderedH + "px";
  ov.style.pointerEvents = "auto";
  ov.innerHTML = "";

  const tooltip = getGlobalTooltip();

  diagram.steps.forEach(step => {
    const [x1, y1, x2, y2] = step.coords.split(",").map(Number);

    const scaleX = renderedW / nw;
    const scaleY = renderedH / nh;

    const left   = Math.round(x1 * scaleX);
    const top    = Math.round(y1 * scaleY);
    const width  = Math.round((x2 - x1) * scaleX);
    const height = Math.round((y2 - y1) * scaleY);

    const zone = document.createElement("div");
    zone.style.cssText = `
      position:absolute;
      left:${left}px;
      top:${top}px;
      width:${width}px;
      height:${height}px;
      cursor:pointer;
      border-radius:4px;
      box-sizing:border-box;
      transition:background 0.12s, outline 0.12s;
    `;

    zone.addEventListener("mouseenter", () => {
      zone.style.background = "rgba(37,99,235,0.22)";
      zone.style.outline = "2px solid rgba(37,99,235,0.9)";
      tooltip.textContent = step.label;
      tooltip.style.display = "block";
    });

    zone.addEventListener("mousemove", (e) => {
      tooltip.style.left = e.clientX + "px";
      tooltip.style.top  = (e.clientY - 12) + "px";
    });

    zone.addEventListener("mouseleave", () => {
      zone.style.background = "";
      zone.style.outline = "";
      tooltip.style.display = "none";
    });

    zone.addEventListener("click", () => {
      tooltip.style.display = "none";
      clickStep(step.question, step.label, diagram);
    });

    ov.appendChild(zone);
  });
}

function buildDiagramHTML(diagram, uid) {
  window._diagStore[uid] = diagram;

  return `<div class="diagram-box">
    <div class="diagram-title">Κλινικός Αλγόριθμος</div>
    <div class="diagram-nav-hint">
      <span class="hint-icon">&#9432;</span>
      <span>Τοποθετήστε τον κέρσορα πάνω στο διάγραμμα — τα κλικάρισμα βήματα εμφανίζονται με <strong>μπλε πλαίσιο</strong>. Κάντε κλικ για εξήγηση.</span>
    </div>

    <div class="diagram-image-wrap" id="wrap-${uid}">
      <img src="${diagram.image}" alt="${escapeHtml(diagram.caption)}"
           class="diagram-img" id="img-${uid}"
           onload="initOverlay('${uid}')" />
      <div id="ov-${uid}" class="diagram-overlay"></div>
    </div>

    <div class="diagram-footer-row">
      <span class="diagram-caption">${escapeHtml(diagram.caption)}</span>
      <div class="diagram-footer-actions">
        <button class="diagram-view-btn" onclick="openFullDiagram('${uid}')">Προβολή πλήρους διαγράμματος</button>
        <button class="diagram-chat-btn" onclick="openDiagramChat('${uid}')">Ανοίξτε Chat Εξήγησης</button>
      </div>
    </div>
  </div>`;
}


function ensureFullDiagramModal() {
  let modal = document.getElementById("fullDiagramModal");

  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "fullDiagramModal";
  modal.className = "full-diagram-modal";
  modal.innerHTML = `
    <div class="full-diagram-card">
      <div class="full-diagram-head">
        <div>
          <h3 id="fullDiagramTitle">Διάγραμμα</h3>
          <p>Πλήρης προβολή χωρίς κόψιμο. Πατήστε Esc ή το × για κλείσιμο.</p>
        </div>
        <button class="full-diagram-close" onclick="closeFullDiagram()">×</button>
      </div>
      <div class="full-diagram-body">
        <img id="fullDiagramImg" src="" alt="Πλήρης προβολή διαγράμματος">
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeFullDiagram();
  });

  return modal;
}

function openFullDiagram(uid) {
  const diagram = window._diagStore?.[uid];
  if (!diagram) return;

  const modal = ensureFullDiagramModal();
  const title = document.getElementById("fullDiagramTitle");
  const img = document.getElementById("fullDiagramImg");

  title.textContent = diagram.caption || "Διάγραμμα";
  img.src = diagram.image;
  img.alt = diagram.caption || "Διάγραμμα";

  modal.classList.add("open");
}

function closeFullDiagram() {
  document.getElementById("fullDiagramModal")?.classList.remove("open");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeFullDiagram();
});


function clickStep(question, label, diagram) {
  window._currentDiagram = diagram;
  document.getElementById("diagramPanelTitle").textContent = diagram.caption;
  document.getElementById("diagramPanelImg").src = diagram.image;
  document.getElementById("diagramChatMessages").innerHTML =
    `<div class="dchat-welcome">Εξηγώ: <strong>${escapeHtml(label)}</strong></div>`;
  document.getElementById("diagramPanel").classList.add("open");
  document.getElementById("diagramInput").value = question;
  sendDiagramQuestion();
}

function openDiagramChat(uid) {
  const diagram = window._diagStore[uid];
  if (!diagram) return;
  window._currentDiagram = diagram;
  document.getElementById("diagramPanelTitle").textContent = diagram.caption;
  document.getElementById("diagramPanelImg").src = diagram.image;
  document.getElementById("diagramChatMessages").innerHTML = `
    <div class="dchat-welcome">
      Κάνε κλικ σε βήμα του διαγράμματος ή ρώτησέ με εδώ.<br><br>
      <strong>Παραδείγματα:</strong><br>
      • "Τι σημαίνει αιμοδυναμική αστάθεια;"<br>
      • "Πότε χορηγείται Προκαϊναμίδη;"<br>
      • "Τι είναι η Ηλεκτρική Καρδιομετατροπή;"
    </div>`;
  document.getElementById("diagramPanel").classList.add("open");
}

/* ══ Sources ══ */
function buildSources(chunks) {
  if (!chunks?.length) return "";
  const seen = new Set();
  const unique = chunks.filter(s => {
    const k = s.source || "?";
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  const rows = unique.map(s => {
    const cat = s.category === "greek" ? "Ελληνικά πρωτόκολλα"
              : s.category === "international" ? "Διεθνείς οδηγίες ESC"
              : s.category === "american" ? "Αμερικανικές οδηγίες ACC/AHA/HRS"
              : s.category || "";
    return `<div class="source-item">
      <div class="source-item-header">
        <span class="source-name">${escapeHtml(s.source || "Άγνωστη πηγή")}</span>
        ${cat ? `<span class="source-cat">${escapeHtml(cat)}</span>` : ""}
      </div>
      ${s.snippet ? `<div class="source-snippet">${escapeHtml(s.snippet)}</div>` : ""}
    </div>`;
  }).join("");
  return `<div class="sources-block"><div class="sources-title">Πηγές (${unique.length})</div>${rows}</div>`;
}

/* ══ Bubble ══ */
function buildBubble(m) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${m.role}`;
  bubble.dataset.msgId = m.id || "";
  const label = m.role === "user" ? "Χρήστης" : "Cardio Assistant";
  let inner = `
    <div class="bubble-header">
      <span>${label}</span><span>${m.time}</span>
      ${m.role === "bot" && m.streaming ? '<span class="streaming-dot">● γράφει…</span>' : ""}
    </div>
    <div class="bubble-text" id="text-${m.id}">
      ${m.role === "bot"
        ? (m.text ? renderMarkdown(m.text) : '<div class="typing-dots"><span></span><span></span><span></span></div>')
        : escapeHtml(m.text || "")}
    </div>`;
  if (m.role === "bot" && !m.streaming) {
    inner += `<div class="bubble-actions">
      <button class="mini-action-btn" onclick="copyAnswer('${m.id}')">📋 Αντιγραφή απάντησης</button>
    </div>`;
    if (m.sources?.length) inner += buildSources(m.sources);
    if (m.diagram) {
      const uid = "d" + Math.random().toString(36).slice(2, 8);
      inner += buildDiagramHTML(m.diagram, uid);
    }
  }
  bubble.innerHTML = inner;
  return bubble;
}


function copyAnswer(id) {
  const msg = messages.find(m => m.id === id);
  if (!msg?.text) return;

  navigator.clipboard?.writeText(msg.text).then(() => {
    showMiniToast("Η απάντηση αντιγράφηκε.");
  }).catch(() => {
    const tmp = document.createElement("textarea");
    tmp.value = msg.text;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand("copy");
    document.body.removeChild(tmp);
    showMiniToast("Η απάντηση αντιγράφηκε.");
  });
}

function showMiniToast(message) {
  let toast = document.getElementById("miniToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "miniToast";
    toast.className = "mini-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(window._miniToastTimer);
  window._miniToastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}


/* ══ Render ══ */
function renderMessages() {
  chatMain.innerHTML = "";
  if (!messages.length && !isLoading) {
    chatMain.innerHTML = `
      <div class="chat-welcome">
        <h2>Καλώς ήρθες στο Cardio Chatbot</h2>
        <p>Επίλεξε θέμα ή γράψε την ερώτησή σου:</p>
        <ul>
          <li onclick="askSuggestion('Ποια είναι η θεραπευτική διαχείριση και παρακολούθηση ασθενή με κολπική μαρμαρυγή;')">Θεραπευτική διαχείριση κολπικής μαρμαρυγής</li>
          <li onclick="askSuggestion('Τι είναι το CHA₂DS₂-VASc score και πότε χρειάζομαι αντιπηκτικά;')">CHA₂DS₂-VASc score — πότε χρειάζομαι αντιπηκτικά;</li>
          <li onclick="askSuggestion('Ποια είναι η διαφορά έλεγχου ρυθμού και συχνότητας στην κολπική μαρμαρυγή;')">Έλεγχος ρυθμού vs συχνότητας</li>
          <li onclick="askSuggestion('Πώς αντιμετωπίζεται η εμμένουσα μονόμορφη κοιλιακή ταχυκαρδία;')">Εμμένουσα μονόμορφη κοιλιακή ταχυκαρδία</li>
          <li onclick="askSuggestion('Ηλεκτρική θύελλα από πολύμορφη κοιλιακή ταχυκαρδία αντιμετώπιση;')">Ηλεκτρική θύελλα — αντιμετώπιση</li>
          <li onclick="askSuggestion('Ποιες είναι οι ενδείξεις εμφύτευσης απινιδωτή ICD;')">Ενδείξεις εμφύτευσης απινιδωτή (ICD)</li>
        </ul>
      </div>`;
    renderHistory(); return;
  }
  messages.forEach(m => chatMain.appendChild(buildBubble(m)));
  chatMain.scrollTop = chatMain.scrollHeight;
  renderHistory();
}

function askSuggestion(text) { userInput.value = text; sendMessage(); }

function renderHistory() {
  historyList.innerHTML = "";
  const qs = messages.filter(m => m.role === "user");
  if (!qs.length) {
    historyList.innerHTML = '<div class="sidebar-empty">Δεν υπάρχουν ακόμα ερωτήσεις.</div>';
    return;
  }
  qs.forEach(q => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerText = q.text.slice(0, 60);
    historyList.appendChild(div);
  });
}

/* ══ Send ══ */
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isLoading) return;
  const msgId = Date.now().toString();
  messages.push({ id: `u-${msgId}`, role: "user", text, time: nowTime() });
  userInput.value = ""; userInput.style.height = "auto";
  isLoading = true; sendBtn.disabled = true; sendBtn.textContent = "...";
  renderMessages();
  const botMsgId = `b-${msgId}`;
  const diagram  = detectDiagram(text, userType.value);
  const botMsg   = { id: botMsgId, role: "bot", text: "", time: nowTime(), streaming: true, sources: [], diagram: null };
  messages.push(botMsg);
  const streamBubble = buildBubble(botMsg);
  chatMain.appendChild(streamBubble);
  chatMain.scrollTop = chatMain.scrollHeight;
  const textEl = document.getElementById(`text-${botMsgId}`);
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: text, user_type: userType.value,
        history: messages.filter(m => m.role !== "bot" || m.text).slice(-12)
          .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        try {
          const ev = JSON.parse(raw);
          if (ev.type === "token") {
            full += ev.token; botMsg.text = full;
            if (textEl) textEl.innerHTML = renderMarkdown(full);
            chatMain.scrollTop = chatMain.scrollHeight;
          } else if (ev.type === "meta") {
            botMsg.sources = ev.retrieved_chunks || [];
            botMsg.streaming = false; botMsg.diagram = diagram;
            const old = chatMain.querySelector(`[data-msg-id="${botMsgId}"]`);
            if (old) old.replaceWith(buildBubble(botMsg));
          } else if (ev.type === "error") {
            botMsg.text = `Σφάλμα: ${ev.message}`; botMsg.streaming = false;
            if (textEl) textEl.textContent = botMsg.text;
          }
        } catch {}
      }
    }
    if (botMsg.streaming) {
      botMsg.streaming = false; botMsg.diagram = diagram;
      const old = chatMain.querySelector(`[data-msg-id="${botMsgId}"]`);
      if (old) old.replaceWith(buildBubble(botMsg));
    }
    if (canUseTTS && speakToggle?.checked) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(full); u.lang = "el-GR";
      window.speechSynthesis.speak(u);
    }
  } catch (err) {
    botMsg.text = "Παρουσιάστηκε σφάλμα επικοινωνίας με τον εξυπηρετητή.";
    botMsg.streaming = false;
    const old = chatMain.querySelector(`[data-msg-id="${botMsgId}"]`);
    if (old) old.replaceWith(buildBubble(botMsg));
    console.error(err);
  } finally {
    isLoading = false; sendBtn.disabled = false; sendBtn.textContent = "➤";
    localStorage.setItem("chat_history", JSON.stringify(messages));
    renderHistory(); chatMain.scrollTop = chatMain.scrollHeight;
  }
}

/* ══ Diagram Chat Panel ══ */
let diagramChatMessages = [];
let diagramChatLoading  = false;

function closeDiagramPanel() {
  document.getElementById("diagramPanel").classList.remove("open");
  diagramChatMessages = [];
}

async function sendDiagramQuestion() {
  const input = document.getElementById("diagramInput");
  const text  = input.value.trim();
  if (!text || diagramChatLoading) return;
  input.value = ""; diagramChatLoading = true;
  const messagesEl = document.getElementById("diagramChatMessages");
  messagesEl.innerHTML += `<div class="dchat-user">${escapeHtml(text)}</div>`;
  messagesEl.scrollTop = messagesEl.scrollHeight;
  const botId = "dc-" + Date.now();
  messagesEl.innerHTML += `<div class="dchat-bot" id="${botId}"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  messagesEl.scrollTop = messagesEl.scrollHeight;
  try {
    const audienceNote = userType.value === "patient"
      ? "Εξήγησε με απλά λόγια για ασθενή, χωρίς δύσκολη ορολογία. "
      : "Εξήγησε με ιατρική ακρίβεια για γιατρό. ";

    const ctx = `[DIAGRAM MODE] Εξηγείς αποκλειστικά το διάγραμμα: "${window._currentDiagram?.caption}". ` +
      audienceNote +
      `Δώσε σύντομη εξήγηση ΜΟΝΟ για αυτό που ρωτάει ο χρήστης. ` +
      `ΜΗΝ συγκρίνεις ελληνικά με διεθνή πρωτόκολλα. Μέγιστο 4-5 προτάσεις.`;
    const res = await fetch(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: ctx + " Ερώτηση: " + text,
        user_type: userType.value,
        history: diagramChatMessages.slice(-6)
      })
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        try {
          const ev = JSON.parse(raw);
          if (ev.type === "token") {
            full += ev.token;
            const el = document.getElementById(botId);
            if (el) el.innerHTML = renderMarkdown(full);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        } catch {}
      }
    }
    diagramChatMessages.push({ role: "user", content: text });
    diagramChatMessages.push({ role: "assistant", content: full });
  } catch (err) {
    const el = document.getElementById(botId);
    if (el) el.textContent = "Σφάλμα επικοινωνίας.";
  } finally {
    diagramChatLoading = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function handleDiagramKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDiagramQuestion(); }
}

/* ══ Controls ══ */
function handleKeyDown(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}
function toggleTheme() { document.body.classList.toggle("light-theme"); }
themeToggleBtn?.addEventListener("click", toggleTheme);

function clearChat() {
  messages = []; localStorage.removeItem("chat_history"); renderMessages();
}

function startVoiceInput() {
  if (!SpeechRecognition) { alert("Ο browser δεν υποστηρίζει φωνητική αναγνώριση."); return; }
  const r = new SpeechRecognition(); r.lang = "el-GR";
  r.onresult = e => { userInput.value = e.results[0][0].transcript; sendMessage(); };
  r.start();
}

userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 140) + "px";
});

function stripMarkdownForPdf(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^[-•]\s*/gm, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeForReport(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripMarkdownForReport(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^[-•]\s*/gm, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatReportText(text) {
  return escapeForReport(stripMarkdownForReport(text))
    .replace(/\n/g, "<br>");
}

function getLastQAPairsForReport() {
  const pairs = [];

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") {
      const bot = messages.slice(i + 1).find(m => m.role === "bot" && m.text);
      if (bot) pairs.push({ question: messages[i], answer: bot });
    }
  }

  return pairs;
}

function buildClinicalReportHTML() {
  const exportDate = new Date().toLocaleString("el-GR");
  const userTypeLabel = userType?.value === "doctor" ? "Γιατρός" : "Ασθενής";
  const pairs = getLastQAPairsForReport();

  const reports = pairs.map((pair, idx) => {
    const sources = pair.answer.sources?.length
      ? [...new Map(pair.answer.sources.map(s => [s.source || "Άγνωστη πηγή", s])).values()]
          .map(s => {
            const cat = s.category === "greek" ? "Ελληνικά πρωτόκολλα"
                      : s.category === "international" ? "ESC Guidelines"
                      : s.category === "american" ? "ACC/AHA/HRS Guidelines"
                      : s.category || "Πηγή";
            return `<li><strong>${escapeForReport(s.source || "Άγνωστη πηγή")}</strong> — ${escapeForReport(cat)}</li>`;
          }).join("")
      : "<li>Δεν καταγράφηκαν πηγές για αυτή την απάντηση.</li>";

    return `
      <section class="report-section page-break">
        <h2>Κλινική ερώτηση ${idx + 1}</h2>

        <div class="section-card">
          <h3>Ερώτηση</h3>
          <p>${formatReportText(pair.question.text)}</p>
        </div>

        <div class="section-card">
          <h3>Απάντηση</h3>
          <p>${formatReportText(pair.answer.text)}</p>
        </div>

        <div class="section-card">
          <h3>Κλινικές πηγές</h3>
          <ul>${sources}</ul>
        </div>

        <div class="warning-card">
          <h3>Προσοχή</h3>
          <p>
            Η παρούσα αναφορά αποτελεί εργαλείο πληροφόρησης και υποστήριξης.
            Δεν αντικαθιστά την κλινική κρίση ιατρού και δεν πρέπει να χρησιμοποιείται
            ως μοναδική βάση διάγνωσης ή θεραπευτικής απόφασης.
          </p>
        </div>
      </section>
    `;
  }).join("");

  return `<!doctype html>
<html lang="el">
<head>
  <meta charset="utf-8">
  <title>Cardio Chatbot — Clinical Report</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, "Segoe UI", sans-serif;
      color: #172033;
      background: #eef3fb;
      line-height: 1.55;
    }
    .report {
      max-width: 980px;
      margin: 0 auto;
      background: #fff;
      min-height: 100vh;
    }
    .hero {
      background: #173a63;
      color: white;
      padding: 42px 56px;
    }
    .hero h1 {
      margin: 0;
      font-size: 30px;
      letter-spacing: -0.02em;
    }
    .hero p {
      margin: 10px 0 0;
      color: #d7e6fa;
      font-size: 15px;
    }
    .meta {
      margin: 28px 56px;
      padding: 18px 22px;
      background: #f5f8fd;
      border: 1px solid #cbdcf3;
      border-radius: 14px;
    }
    .meta h2 {
      margin: 0 0 10px;
      color: #173a63;
      font-size: 18px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      font-size: 13px;
    }
    .meta-grid strong {
      display: block;
      color: #426083;
      margin-bottom: 3px;
    }
    .report-section {
      padding: 0 56px 32px;
    }
    .report-section h2 {
      color: #173a63;
      margin: 28px 0 14px;
      font-size: 22px;
    }
    .section-card {
      border: 1px solid #cbdcf3;
      background: #f8fbff;
      border-radius: 12px;
      padding: 15px 18px;
      margin: 14px 0;
    }
    .section-card h3 {
      margin: 0 0 10px;
      color: #1d5f9f;
      font-size: 16px;
      border-bottom: 1px solid #d9e6f7;
      padding-bottom: 6px;
    }
    .section-card p {
      margin: 0;
      white-space: normal;
    }
    ul { margin: 8px 0 0 20px; padding: 0; }
    li { margin: 6px 0; }
    .warning-card {
      border: 1px solid #f3c978;
      background: #fff8e8;
      color: #6d4b00;
      border-radius: 12px;
      padding: 15px 18px;
      margin: 14px 0;
    }
    .warning-card h3 {
      margin: 0 0 8px;
      font-size: 16px;
    }
    .print-actions {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 12px 18px;
      background: rgba(238, 243, 251, 0.92);
      border-bottom: 1px solid #d8e4f5;
      backdrop-filter: blur(8px);
    }
    .print-actions button {
      border: 0;
      border-radius: 10px;
      padding: 9px 13px;
      cursor: pointer;
      color: white;
      background: #2563eb;
      font-weight: 700;
    }
    .print-actions button.secondary {
      background: #475569;
    }
    @media print {
      body { background: white; }
      .report { max-width: none; }
      .print-actions { display: none; }
      .page-break { break-inside: avoid; }
      .section-card, .warning-card { break-inside: avoid; }
      @page { margin: 14mm; }
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button onclick="window.print()">Αποθήκευση ως PDF / Εκτύπωση</button>
    <button class="secondary" onclick="window.close()">Κλείσιμο</button>
  </div>

  <main class="report">
    <header class="hero">
      <h1>Cardio Chatbot — Clinical Report</h1>
      <p>Web-based RAG Clinical Decision Support System</p>
    </header>

    <section class="meta">
      <h2>Στοιχεία αναφοράς</h2>
      <div class="meta-grid">
        <div><strong>Ημερομηνία εξαγωγής</strong>${escapeForReport(exportDate)}</div>
        <div><strong>Τύπος χρήστη</strong>${escapeForReport(userTypeLabel)}</div>
        <div><strong>Αριθμός ερωτήσεων</strong>${pairs.length}</div>
      </div>
    </section>

    ${reports || `
      <section class="report-section">
        <div class="section-card">
          <h3>Δεν υπάρχουν δεδομένα</h3>
          <p>Δεν υπάρχει διαθέσιμη συνομιλία για εξαγωγή.</p>
        </div>
      </section>
    `}
  </main>
</body>
</html>`;
}

function exportToPDF() {
  const html = buildClinicalReportHTML();
  const reportWindow = window.open("", "_blank");

  if (!reportWindow) {
    alert("Ο browser μπλόκαρε το άνοιγμα του report. Επιτρέψτε pop-ups για αυτή τη σελίδα.");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();

  reportWindow.onload = () => {
    reportWindow.focus();
  };
}


window.addEventListener("resize", () => {
  Object.keys(window._diagStore || {}).forEach(uid => {
    initOverlay(uid);
  });
});




/* ══ Strong UI label updater: Ελληνικά + ESC + ACC/AHA/HRS ══ */
function updateProtocolUiLabels() {
  const replacements = [
    [
      "Κλινική υποστήριξη αποφάσεων βασισμένη σε Ελληνικά, ESC & ACC/AHA/HRS πρωτόκολλα",
      "Κλινική υποστήριξη αποφάσεων βασισμένη σε Ελληνικά, ESC & ACC/AHA/HRS πρωτόκολλα"
    ],
    [
      "Κλινική υποστήριξη αποφάσεων βασισμένη σε Ελληνικά, ESC & ACC/AHA/HRS πρωτόκολλα",
      "Κλινική υποστήριξη αποφάσεων βασισμένη σε Ελληνικά, ESC & ACC/AHA/HRS πρωτόκολλα"
    ],
    [
      "Ελληνικά + ESC + ACC/AHA/HRS οδηγίες",
      "Ελληνικά + ESC + ACC/AHA/HRS οδηγίες"
    ],
    [
      "GR  Ελληνικά + ESC + ACC/AHA/HRS οδηγίες",
      "GR  Ελληνικά + ESC + ACC/AHA/HRS οδηγίες"
    ],
    [
      "GR Ελληνικά + ESC + ACC/AHA/HRS οδηγίες",
      "GR Ελληνικά + ESC + ACC/AHA/HRS οδηγίες"
    ],
    [
      "Βάσει ελληνικών, ESC & ACC/AHA/HRS πρωτοκόλλων",
      "Βάσει ελληνικών, ESC & ACC/AHA/HRS πρωτοκόλλων"
    ]
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(node => {
    let value = node.nodeValue;
    let changed = false;

    replacements.forEach(([oldText, newText]) => {
      if (value.includes(oldText)) {
        value = value.split(oldText).join(newText);
        changed = true;
      }
    });

    if (changed) node.nodeValue = value;
  });

  document.title = "Cardio Chatbot — Ελληνικά, ESC & ACC/AHA/HRS";
}

function startProtocolUiLabelWatcher() {
  updateProtocolUiLabels();

  if (window._protocolUiLabelObserver) return;

  window._protocolUiLabelObserver = new MutationObserver(() => {
    clearTimeout(window._protocolUiLabelTimer);
    window._protocolUiLabelTimer = setTimeout(updateProtocolUiLabels, 50);
  });

  window._protocolUiLabelObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  setTimeout(updateProtocolUiLabels, 300);
  setTimeout(updateProtocolUiLabels, 1000);
  setTimeout(updateProtocolUiLabels, 2500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startProtocolUiLabelWatcher);
} else {
  startProtocolUiLabelWatcher();
}


renderMessages();