import { bn, type VoiceId } from '../i18n';
import type { Subtitles } from '../ui/Subtitles';

/**
 * বাংলা ভয়েস। প্রতিটি লাইনের জন্য এই ক্রমে চেষ্টা করে:
 *   1. রেকর্ড করা ফাইল  public/assets/voice/bn/<id>.mp3   (সেরা মান - প্রকৃত বাংলা কণ্ঠ)
 *   2. ব্রাউজারের বাংলা TTS ভয়েস (bn-BD / bn-IN) - যদি ডিভাইসে থাকে
 *   3. শুধু বাংলা সাবটাইটেল
 * সাবটাইটেল সবসময় দেখানো হয়।
 */
export class VoiceManager {
  private muted = false;
  private ttsVoice: SpeechSynthesisVoice | null = null;
  private audio: HTMLAudioElement | null = null;
  private token = 0;
  private warned = false;
  /** Step 6: something is being said right now (a recorded file / TTS is playing, or a subtitle-only line is still on screen). */
  private speaking = false;
  private busyUntil = 0;

  constructor(private subtitles: Subtitles) {
    if ('speechSynthesis' in window) {
      const pick = () => {
        this.ttsVoice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('bn')) ?? null;
      };
      pick();
      speechSynthesis.addEventListener('voiceschanged', pick);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.muted) this.stop();
  }

  /** True while a line is being said or shown. Background announcements (trains) wait for it instead of cutting a line off. */
  get busy(): boolean {
    return this.speaking || performance.now() < this.busyUntil;
  }

  /**
   * STAGE 15 / Step 6: a background announcement (train / station). Same chain as speak(): recorded file `<key>.mp3`, browser Bangla TTS,
   * subtitle only. It never interrupts another line: returns false (and says nothing) when the voice is busy.
   */
  speakAnnouncement(key: string, text: string): boolean {
    if (this.busy) return false;
    void this.play(key, text);
    return true;
  }

  async speak(id: VoiceId): Promise<void> {
    await this.play(id, bn.voice[id]);
  }

  private async play(id: string, text: string): Promise<void> {
    this.stop();
    const my = ++this.token;
    const readTime = 2 + text.length * 0.07;

    if (this.muted) {
      this.busyUntil = performance.now() + readTime * 1000;
      this.subtitles.show(text, readTime);
      return;
    }

    // 1. recorded file
    const a = new Audio(`${import.meta.env.BASE_URL}assets/voice/bn/${id}.mp3`);
    try {
      await a.play();
      if (my !== this.token) {
        a.pause();
        return;
      }
      this.audio = a;
      this.speaking = true;
      this.subtitles.show(text, null);
      a.onended = () => {
        if (my === this.token) { this.speaking = false; this.subtitles.hide(); }
      };
      return;
    } catch {
      /* no recorded file: fall through */
    }

    // 2. browser Bangla TTS
    if (this.ttsVoice && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = this.ttsVoice;
      u.lang = this.ttsVoice.lang;
      u.onend = () => {
        if (my === this.token) { this.speaking = false; this.subtitles.hide(); }
      };
      u.onerror = () => {
        if (my === this.token) this.speaking = false;
      };
      this.speaking = true;
      this.subtitles.show(text, null);
      speechSynthesis.speak(u);
      return;
    }

    // 3. subtitles only
    if (!this.warned) {
      this.warned = true;
      console.warn('[VoiceManager] No Bangla voice: add public/assets/voice/bn/<id>.mp3 files. Showing subtitles only.');
    }
    this.busyUntil = performance.now() + readTime * 1000;
    this.subtitles.show(text, readTime);
  }


  /** Speak a dynamic Bengali line (used for Tour destinations and status messages). */
  async speakText(text: string): Promise<void> {
    this.stop();
    const my = ++this.token;
    const readTime = Math.max(2.5, 1.8 + text.length * 0.075);
    if (this.muted) {
      this.busyUntil = performance.now() + readTime * 1000;
      this.subtitles.show(text, readTime);
      return;
    }

    const voices = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    // Bengali text -> a Bengali voice; any other text (the engineering sites are narrated in English) -> an English voice
    const isBengali = /[\u0980-\u09FF]/.test(text);
    const voice = isBengali
      ? this.ttsVoice ?? voices.find((v) => v.lang.toLowerCase().startsWith('bn')) ?? null
      : voices.find((v) => v.lang.toLowerCase() === 'en-us') ?? voices.find((v) => v.lang.toLowerCase().startsWith('en')) ?? null;
    if (voice && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = isBengali ? 0.94 : 0.92;
      utterance.pitch = 0.98;
      utterance.onend = () => { if (my === this.token) { this.speaking = false; this.subtitles.hide(); } };
      utterance.onerror = () => { if (my === this.token) { this.speaking = false; this.busyUntil = performance.now() + readTime * 1000; this.subtitles.show(text, readTime); } };
      this.speaking = true;
      this.subtitles.show(text, null);
      speechSynthesis.speak(utterance);
      return;
    }

    this.busyUntil = performance.now() + readTime * 1000;
    this.subtitles.show(text, readTime);
  }

  stop(): void {
    this.token++;
    this.speaking = false;
    this.busyUntil = 0;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.subtitles.hide();
  }
}
