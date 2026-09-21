/**
 * Voice input through the browser's own speech recognition (Chrome, Edge and Safari have it; Firefox does
 * not). Nothing is installed and nothing goes through our server: the browser handles the microphone and
 * its speech service turns the audio into text. TypeScript's DOM types don't include it, so the small
 * part we use is described here.
 */

export interface SpeechAlternative {
  transcript: string;
}
export interface SpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechAlternative;
}
export interface SpeechEvent {
  readonly results: { readonly length: number; [index: number]: SpeechResult };
}
export interface SpeechErrorEvent {
  readonly error: string;
}
export interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionConstructor = new () => Recognition;

/** The language spoken to Busulla. */
export const SPEECH_LANG = "sq-AL";

export function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Everything heard so far in this recording (interim and final parts), as one line of text. */
export function transcriptOf(e: SpeechEvent): string {
  const parts: string[] = [];
  for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0]?.transcript ?? "");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** What was already typed, followed by what was said. */
export function joinSpoken(typed: string, spoken: string): string {
  const base = typed.trimEnd();
  return base ? `${base} ${spoken}` : spoken;
}

/** A sentence for the person, or null when there is nothing to say (e.g. they stopped it themselves). */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "Leja për mikrofonin u refuzua. Lejoje te shfletuesi për të folur.";
    case "no-speech":
      return "Nuk dëgjova asgjë. Provo përsëri.";
    case "audio-capture":
      return "Nuk u gjet asnjë mikrofon.";
    case "language-not-supported":
      return "Ky shfletues nuk e njeh shqipen për zërin. Shkruaje pyetjen.";
    case "network":
      return "Shërbimi i zërit nuk u arrit. Kontrollo lidhjen dhe provo përsëri.";
    default:
      return "Zëri nuk funksionoi këtë herë. Shkruaje pyetjen.";
  }
}

/* ---------------------------------- punctuation ---------------------------------- */

/**
 * Browser dictation returns bare words: no capital letter, no full stop, no question mark. So when the
 * person stops speaking, the sentence is finished here with simple, readable Albanian rules -- the
 * same way a person would read it back -- instead of leaving it for them to fix by hand.
 */

const plain = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Words that make a sentence a question wherever they appear in its first few words ("në cilën zonë ..."). */
const QUESTION_WORDS = new Set(["cila", "cili", "cilat", "cilet", "cilen", "cilin", "cilit", "cilave", "cfare", "cka", "kush", "kujt", "sa", "ku", "kur", "pse", "perse", "sesi"]);
/** Words that make it a question only as the first word: "Si ka ecur ...", "Ka ankesa ...", "A ka ...". */
const QUESTION_STARTS = new Set(["a", "si", "ka", "mund", "do", "kishte"]);
/** Commands ("Trego ankesat ..."): a full stop, even when they contain "sa" or "ku". */
const COMMAND_WORDS = new Set(["trego", "tregome", "shfaq", "kerko", "gjej", "krahaso", "listo", "jep", "hap", "krijo", "llogarit", "planifiko", "shpjego", "permbledh", "numero", "nxirr", "cakto"]);

export function isQuestion(sentence: string): boolean {
  const words = plain(sentence).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return false;
  if (words.slice(0, 2).some((w) => COMMAND_WORDS.has(w))) return false;
  if (QUESTION_STARTS.has(words[0])) return true;
  return words.slice(0, 3).some((w) => QUESTION_WORDS.has(w));
}

/**
 * Turns what was heard into a finished sentence. `continuing` means it follows text that has no full stop
 * yet (so it must not start with a capital letter).
 */
export function formatSpoken(spoken: string, continuing = false): string {
  let t = spoken.replace(/\s+/g, " ").trim();
  if (!t) return "";

  // Spoken punctuation: "sa kërkesa ka zona tre pikëpyetje" -> "... ?"
  t = t
    .replace(/\s*\bpik[eë]pyetje\b\s*/gi, "? ")
    .replace(/\s*\bpresje\b\s*/gi, ", ")
    .replace(/\s+pik[eë]\s*$/i, ". ")
    .replace(/\s+([.,?!])/g, "$1")
    .trim();

  if (!/[.?!…]$/.test(t)) t += isQuestion(t.split(/[.?!]\s+/).pop() ?? t) ? "?" : ".";
  // Capital letters at the start and after every sentence end.
  t = t.replace(/(^|[.?!]\s+)(\p{L})/gu, (_m, gap: string, ch: string, offset: number) => (offset === 0 && continuing ? gap + ch : gap + ch.toUpperCase()));
  return t;
}
