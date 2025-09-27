import { SAMPLE_RATE } from "../deps/constants";
import { SpectrumAnalyzer } from "../deps/spectrum-analyzer";
import type { PreviewPanelContext } from "./types";

export class AudioManager {
  private readonly context: PreviewPanelContext;
  private firstInteractionHandler: ((event: Event) => void) | null = null;
  private firstInteractionTarget: (HTMLElement | Document) | null = null;

  constructor(context: PreviewPanelContext) {
    this.context = context;
  }

  initialize(): void {
    const state = this.context.getState();
    if (state.audioContext) {
      return;
    }

    const onFirstInteraction = () => {
      const existing = this.context.getState().audioContext;
      if (existing) {
        if (existing.state === "suspended") {
          void existing.resume().catch((error) => {
            console.warn("Failed to resume existing audio context", error);
          });
        }
        this.clearInteractionListeners();
        return;
      }

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      void audioContext.resume().catch((error) => {
        console.warn("Failed to resume preview audio context", error);
      });
      const analyzer = new SpectrumAnalyzer(audioContext);
      analyzer.analyzer.connect(audioContext.destination);
      this.context.patch({ audioContext, analyzer });
      this.clearInteractionListeners();
    };

    const target = document.body ?? document;
    target.addEventListener("click", onFirstInteraction, { once: true });
    target.addEventListener("pointerdown", onFirstInteraction, { once: true });
    target.addEventListener("touchend", onFirstInteraction, { once: true });
    this.firstInteractionHandler = onFirstInteraction;
    this.firstInteractionTarget = target;
  }

  destroy(): void {
    this.clearInteractionListeners();
  }

  private clearInteractionListeners(): void {
    if (this.firstInteractionHandler && this.firstInteractionTarget) {
      this.firstInteractionTarget.removeEventListener("click", this.firstInteractionHandler);
      this.firstInteractionTarget.removeEventListener("pointerdown", this.firstInteractionHandler);
      this.firstInteractionTarget.removeEventListener("touchend", this.firstInteractionHandler);
    }
    this.firstInteractionHandler = null;
    this.firstInteractionTarget = null;
  }
}
