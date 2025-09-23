
import Konva from 'konva';
import cloneDeep from 'lodash/cloneDeep';
import { TimelineElement } from '@/types/timeline';

export interface ProjectSize {
  ratio: string;
  width: number;
  height: number;
  original: {
    width: number;
    height: number;
  };
}

export interface AnimationContext {
  localFrame: number;
  konvaWrapper: Konva.Group;
  konvaObject: Konva.Shape;
  currentTime: number;
  progress: number;
  stageSize: ProjectSize;
}

const clampOpacity = (value: number, max: number, min: number) => (value - min) / (max - min);

const opacityFromHex = (hex: string) => clampOpacity(parseInt(hex, 16), 255, 0);

function applyShadowOpacity(color: string): { shadowColor: string; shadowOpacity: number } {
  return {
    shadowColor: color.substring(0, 7),
    shadowOpacity: opacityFromHex(color.substring(7, 9)),
  };
}

export interface PreviewKonvaNodeConstructorOptions<TElement extends TimelineElement> {
  id: string;
  parentLayer: Konva.Layer | null;
  updateSegment: (payload: { id: string } & Partial<TElement>) => void | Promise<void>;
}

export interface PreviewKonvaNodeMountOptions<TElement extends TimelineElement> {
  element: TElement | null;
  konvaZIndex: number;
  currentTimestamp: number;
  playing: boolean;
  size: ProjectSize;
}

export abstract class PreviewKonvaNode<TElement extends TimelineElement> {
  public readonly id: string;

  protected parentLayer: Konva.Layer | null;

  protected konvaObject: Konva.Node | null = null;

  protected konvaWrapper: Konva.Group | null = null;

  protected visible = false;

  protected mediaElement: HTMLMediaElement | null = null;

  protected dirty = false;

  protected element: TElement | null = null;

  protected konvaZIndex = 0;

  protected currentTimestamp = 0;

  protected playing = false;

  protected size: ProjectSize | null = null;

  private animationFrameId: number | null = null;

  private readonly updateSegmentCallback: (payload: { id: string } & Partial<TElement>) => void | Promise<void>;

  constructor(options: PreviewKonvaNodeConstructorOptions<TElement>) {
    this.id = options.id;
    this.parentLayer = options.parentLayer;
    this.updateSegmentCallback = options.updateSegment;
  }

  get node(): Konva.Node | null {
    return this.konvaObject;
  }

  get wrapper(): Konva.Group | null {
    return this.konvaWrapper;
  }

  get progress(): number {
    if (!this.element) {
      return 0;
    }
    const duration = this.element.duration;
    if (duration <= 0) {
      return 0;
    }
    return ((this.currentTimestamp - this.element.startTime) / duration) * 100;
  }

  get localFrame(): number {
    if (!this.element) {
      return 0;
    }
    return Math.round(((this.currentTimestamp - this.element.startTime) / 1000) * 60);
  }

  async mount(options: PreviewKonvaNodeMountOptions<TElement>): Promise<void> {
    this.element = options.element ? (cloneDeep(options.element) as TElement) : null;
    this.konvaZIndex = options.konvaZIndex;
    this.currentTimestamp = options.currentTimestamp;
    this.playing = options.playing;
    this.size = options.size;

    this.konvaWrapper = new Konva.Group({ x: 0, y: 0, id: this.element?.id ?? this.id });
    this.konvaWrapper.addName('konvaWrapper');
    if (this.parentLayer) {
      this.parentLayer.add(this.konvaWrapper);
    }

    this.startAnimationLoop();
    await this.initKonvaObject();

    if (this.konvaObject) {
      this.konvaObject.on('dragend', (event) => {
        this.dirty = true;
        this.updateSegment({
          id: this.element?.id ?? this.id,
          x: event.target.attrs.x as number,
          y: event.target.attrs.y as number,
        } as { id: string } & Partial<TElement>);
      });

      this.konvaObject.on('transformend', (event) => {
        this.dirty = true;
        this.updateSegment({
          id: this.element?.id ?? this.id,
          rotation: event.target.attrs.rotation,
          scale: {
            x: event.target.attrs.scaleX,
            y: event.target.attrs.scaleY,
          },
          x: event.target.attrs.x as number,
          y: event.target.attrs.y as number,
        } as { id: string } & Partial<TElement>);
      });

      this.konvaObject.position({
        x: this.element?.x ?? 0,
        y: this.element?.y ?? 0,
      });
      this.konvaObject.scale({
        x: this.element?.scale?.x ?? 1,
        y: this.element?.scale?.y ?? 1,
      });
      this.konvaObject.draggable(true);
      if (this.element) {
        this.konvaObject.opacity(this.element.opacity);
        this.konvaObject.rotation(this.element.rotation);
        this.konvaObject.name(this.element.id);
      }
      this.konvaWrapper?.zIndex(this.konvaZIndex);
    }

    this.hide();
    if (this.konvaObject && this.konvaWrapper && this.parentLayer) {
      this.konvaWrapper.add(this.konvaObject as Konva.Group);
      this.parentLayer.add(this.konvaWrapper);
    }
    this.calculateShowHide();

    document.addEventListener('updateZIndex', this.handleGlobalZIndexUpdate);
    document.dispatchEvent(new CustomEvent('updateZIndex'));
  }

  destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    document.removeEventListener('updateZIndex', this.handleGlobalZIndexUpdate);
    this.konvaObject?.destroy();
    this.konvaWrapper?.destroy();
    this.mediaElement?.remove?.();
  }

  setParentLayer(layer: Konva.Layer | null): void {
    this.parentLayer = layer;
    if (layer && this.konvaWrapper) {
      layer.add(this.konvaWrapper);
    }
  }

  setElement(element: TElement | null): void {
    const previous = this.element ? cloneDeep(this.element) : null;
    this.element = element ? (cloneDeep(element) as TElement) : null;
    this.handleSegmentChange(this.element, previous);
  }

  setKonvaZIndex(value: number): void {
    if (this.konvaZIndex === value) {
      return;
    }
    this.konvaZIndex = value;
    if (this.konvaWrapper) {
      this.konvaWrapper.zIndex(value);
    }
  }

  setCurrentTimestamp(value: number): void {
    if (this.currentTimestamp === value) {
      return;
    }
    this.currentTimestamp = value;
    this.calculateShowHide(value);
  }

  setPlaying(value: boolean): void {
    if (this.playing === value) {
      return;
    }
    const previous = this.playing;
    this.playing = value;
    this.onPlayingChange(value, previous);
  }

  setSize(size: ProjectSize): void {
    this.size = size;
  }

  protected abstract initKonvaObject(): Promise<void> | void;

  protected onPlayingChange(_next: boolean, _previous: boolean): void {
    // Subclasses can override.
  }

  protected onSegmentUpdated(_newSegment: TElement | null, _previousSegment: TElement | null): void {
    // Subclasses can override.
  }

  protected hideCallback(): void {
    // Subclasses can override.
  }

  protected showCallback(): void {
    // Subclasses can override.
  }

  protected sync(_timestamp: number, _force?: boolean): void {
    // Subclasses can override.
  }

  protected updateSegment(payload: { id: string } & Partial<TElement>): void {
    void this.updateSegmentCallback(payload);
  }

  protected calculateShowHide(timestamp?: number): void {
    const current = timestamp ?? this.currentTimestamp;
    if (!this.element) {
      return;
    }
    const startTime = this.element.startTime + this.element.trimStart;
    const endTime = this.element.startTime + this.element.duration - this.element.trimEnd;
    if (current >= startTime && current <= endTime) {
      if (!this.visible) {
        this.show();
      }
    } else if (this.visible) {
      this.hide();
    }
    this.sync(current);
  }

  private startAnimationLoop(): void {
    const loop = () => {
      if (!this.element || !this.konvaObject || !this.konvaWrapper || !this.size) {
        this.animationFrameId = requestAnimationFrame(loop);
        return;
      }
      const context: AnimationContext = {
        localFrame: this.localFrame,
        konvaWrapper: this.konvaWrapper,
        konvaObject: this.konvaObject as Konva.Shape,
        currentTime: 16.666666666666668 * this.localFrame,
        progress: this.progress,
        stageSize: this.size,
      };
      if (this.playing && this.element.animations) {
        this.element.animations.forEach((animation) => {
          switch (animation.type) {
            case 'fadeIn':
              this.handleFade(context, animation.duration);
              break;
            case 'floatRight':
              this.handleFloatRight(context);
              break;
            case 'floatLeft':
              this.handleFloatLeft(context);
              break;
            case 'floatUp':
              this.handleFloatUp(context);
              break;
            case 'floatDown':
              this.handleFloatDown(context);
              break;
            case 'scrollUp':
              this.handleScrollUp(context);
              break;
            case 'wipeIn':
              this.handleWipeIn(context);
              break;
            case 'spinIn':
              this.handleSpinIn(context);
              break;
            default:
              break;
          }
        });
      } else if (this.element.animations) {
        this.element.animations.forEach((animation) => {
          switch (animation.type) {
            case 'fadeIn':
              this.resetFade(context);
              break;
            case 'floatRight':
              this.resetFloatRight(context);
              break;
            case 'floatLeft':
              this.resetFloatLeft(context);
              break;
            case 'floatUp':
              this.resetFloatUp(context);
              break;
            case 'floatDown':
              this.resetFloatDown(context);
              break;
            case 'scrollUp':
              this.resetScrollUp(context);
              break;
            case 'wipeIn':
              this.resetWipeIn(context);
              break;
            case 'spinIn':
              this.resetSpinIn(context);
              break;
            default:
              break;
          }
        });
      }
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private handleGlobalZIndexUpdate = () => {
    if (this.konvaWrapper) {
      this.konvaWrapper.zIndex(this.konvaZIndex);
    }
  };

  private handleSegmentChange(newSegment: TElement | null, previousSegment: TElement | null): void {
    if (!newSegment || !previousSegment || !this.konvaObject) {
      this.calculateShowHide();
      this.onSegmentUpdated(newSegment, previousSegment);
      return;
    }

    if (this.dirty) {
      this.dirty = false;
      this.calculateShowHide();
      this.onSegmentUpdated(newSegment, previousSegment);
      return;
    }

    if (previousSegment.opacity !== newSegment.opacity) {
      this.konvaObject.opacity(newSegment.opacity);
    }
    if (previousSegment.rotation !== newSegment.rotation) {
      this.konvaObject.rotation(parseFloat(String(newSegment.rotation)));
    }
    if (previousSegment.x !== newSegment.x || previousSegment.y !== newSegment.y) {
      this.konvaObject.position({ x: newSegment.x, y: newSegment.y });
    }
    if (JSON.stringify(previousSegment.scale) !== JSON.stringify(newSegment.scale)) {
      this.konvaObject.scale({
        x: newSegment.scale?.x ?? 1,
        y: newSegment.scale?.y ?? 1,
      });
    }

    const anySegment = newSegment as unknown as Record<string, unknown>;
    const prevAny = previousSegment as unknown as Record<string, unknown>;

    if (prevAny.color !== anySegment.color && 'fill' in this.konvaObject) {
      (this.konvaObject as Konva.Shape).fill(anySegment.color as string);
    }
    if (prevAny.bars !== anySegment.bars) {
      this.konvaObject.setAttr('bars', anySegment.bars);
    }
    if (prevAny.wave !== anySegment.wave) {
      this.konvaObject.setAttr('waveType', anySegment.wave);
    }
    if (prevAny.barType !== anySegment.barType) {
      this.konvaObject.setAttr('barType', anySegment.barType);
    }
    if (prevAny.corners !== anySegment.corners) {
      this.konvaObject.setAttr('corners', anySegment.corners);
    }
    if (prevAny.text !== anySegment.text && 'text' in this.konvaObject) {
      (this.konvaObject as Konva.Text).text(anySegment.text as string);
    }
    if (prevAny.fontSize !== anySegment.fontSize && 'fontSize' in this.konvaObject) {
      (this.konvaObject as Konva.Text).fontSize(anySegment.fontSize as number);
    }
    if (prevAny.align !== anySegment.align && 'align' in this.konvaObject) {
      (this.konvaObject as Konva.Text).align(anySegment.align as string);
    }
    if (prevAny.verticalAlign !== anySegment.verticalAlign && 'verticalAlign' in this.konvaObject) {
      (this.konvaObject as Konva.Text).verticalAlign(anySegment.verticalAlign as string);
    }
    if (prevAny.letterSpacing !== anySegment.letterSpacing && 'letterSpacing' in this.konvaObject) {
      (this.konvaObject as Konva.Text).letterSpacing(anySegment.letterSpacing as number);
    }
    if (prevAny.lineHeight !== anySegment.lineHeight && 'lineHeight' in this.konvaObject) {
      (this.konvaObject as Konva.Text).lineHeight(anySegment.lineHeight as number);
    }

    const updateFontStyle = () => {
      const isBold = Boolean((anySegment as Record<string, unknown>).bold);
      const isItalic = Boolean((anySegment as Record<string, unknown>).italic);
      const style = isBold && isItalic ? 'italic bold' : isBold ? 'bold' : isItalic ? 'italic' : 'normal';
      if (this.konvaObject && 'fontStyle' in this.konvaObject) {
        (this.konvaObject as Konva.Text).fontStyle(style);
      }
    };

    if (prevAny.bold !== anySegment.bold) {
      updateFontStyle();
    }
    if (prevAny.italic !== anySegment.italic) {
      updateFontStyle();
    }

    const underline = Boolean(anySegment.underline);
    const strikethrough = Boolean(anySegment.strikethrough);
    const previousUnderline = Boolean(prevAny.underline);
    const previousStrikethrough = Boolean(prevAny.strikethrough);
    if (underline !== previousUnderline || strikethrough !== previousStrikethrough) {
      const decoration = underline && strikethrough
        ? 'underline line-through'
        : underline
          ? 'underline'
          : strikethrough
            ? 'line-through'
            : '';
      if ('textDecoration' in this.konvaObject) {
        (this.konvaObject as Konva.Text).textDecoration(decoration);
      }
    }

    const previousFontFamily = (prevAny.font as Record<string, unknown> | undefined)?.family as string | undefined;
    const nextFontFamily = (anySegment.font as Record<string, unknown> | undefined)?.family as string | undefined;
    if (previousFontFamily !== nextFontFamily && nextFontFamily) {
      setTimeout(() => {
        if (this.konvaObject && 'fontFamily' in this.konvaObject) {
          (this.konvaObject as Konva.Text).fontFamily(nextFontFamily);
        }
      }, 200);
    }

    if (prevAny.strokeWidth !== anySegment.strokeWidth && 'strokeWidth' in this.konvaObject) {
      (this.konvaObject as Konva.Shape).strokeWidth(anySegment.strokeWidth as number);
    }
    if (prevAny.shadowBlur !== anySegment.shadowBlur && 'shadowBlur' in this.konvaObject) {
      (this.konvaObject as Konva.Shape).shadowBlur(anySegment.shadowBlur as number);
    }
    if (prevAny.shadowOffsetX !== anySegment.shadowOffsetX && 'shadowOffsetX' in this.konvaObject) {
      (this.konvaObject as Konva.Shape).shadowOffsetX(anySegment.shadowOffsetX as number);
    }
    if (prevAny.shadowOffsetY !== anySegment.shadowOffsetY && 'shadowOffsetY' in this.konvaObject) {
      (this.konvaObject as Konva.Shape).shadowOffsetY(anySegment.shadowOffsetY as number);
    }
    if (JSON.stringify(prevAny.options) !== JSON.stringify(anySegment.options)) {
      this.konvaObject.setAttr('options', anySegment.options);
    }
    const previousStroke = (prevAny.options as Record<string, unknown> | undefined)?.stokeColor as string | undefined;
    const nextStroke = (anySegment.options as Record<string, unknown> | undefined)?.stokeColor as string | undefined;
    if (previousStroke !== nextStroke && nextStroke && 'stroke' in this.konvaObject) {
      (this.konvaObject as Konva.Shape).stroke(nextStroke);
    }
    const previousShadowColor = (prevAny.options as Record<string, unknown> | undefined)?.shadowColor as string | undefined;
    const nextShadowColor = (anySegment.options as Record<string, unknown> | undefined)?.shadowColor as string | undefined;
    if (previousShadowColor !== nextShadowColor && nextShadowColor && 'shadowColor' in this.konvaObject) {
      const { shadowColor, shadowOpacity } = applyShadowOpacity(nextShadowColor);
      (this.konvaObject as Konva.Shape).shadowColor(shadowColor);
      (this.konvaObject as Konva.Shape).shadowOpacity(shadowOpacity);
    }
    if (JSON.stringify((prevAny as { cornerRadius?: unknown }).cornerRadius) !== JSON.stringify((anySegment as { cornerRadius?: unknown }).cornerRadius)) {
      this.konvaObject.setAttr('cornerRadius', (anySegment as { cornerRadius?: unknown }).cornerRadius);
    }

    const previousAnimations = previousSegment.animations ?? [];
    const nextAnimations = newSegment.animations ?? [];
    const animationsChanged =
      previousAnimations.length !== nextAnimations.length ||
      previousAnimations.some((animation, index) => animation.type !== nextAnimations[index]?.type);
    if (animationsChanged && this.konvaObject && this.konvaWrapper) {
      const context: AnimationContext = {
        localFrame: this.localFrame,
        konvaWrapper: this.konvaWrapper,
        konvaObject: this.konvaObject as Konva.Shape,
        progress: this.progress,
        stageSize: this.size ?? { width: 0, height: 0, ratio: 'original', original: { width: 0, height: 0 } },
        currentTime: 0,
      };
      previousAnimations.forEach((animation) => {
        switch (animation.type) {
          case 'fadeIn':
            this.resetFade(context);
            break;
          case 'floatRight':
            this.resetFloatRight(context);
            break;
          case 'floatLeft':
            this.resetFloatLeft(context);
            break;
          case 'floatUp':
            this.resetFloatUp(context);
            break;
          case 'floatDown':
            this.resetFloatDown(context);
            break;
          case 'scrollUp':
            this.resetScrollUp(context);
            break;
          case 'wipeIn':
            this.resetWipeIn(context);
            break;
          case 'spinIn':
            this.resetSpinIn(context);
            break;
          default:
            break;
        }
      });
    }

    this.calculateShowHide(this.currentTimestamp);
    this.onSegmentUpdated(newSegment, previousSegment);
  }

  private hide(): void {
    if (this.konvaWrapper) {
      this.konvaWrapper.hide();
    }
    this.visible = false;
    this.hideCallback();
  }

  private show(): void {
    if (this.konvaWrapper) {
      this.konvaWrapper.show();
      this.konvaWrapper.zIndex(this.konvaZIndex);
    }
    this.visible = true;
    this.showCallback();
  }

  private resetFade(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    wrapper.opacity(1);
  }

  private resetFloatRight(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    wrapper.opacity(1);
    wrapper.x(0);
  }

  private resetFloatLeft(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    wrapper.opacity(1);
    wrapper.x(0);
  }

  private resetFloatUp(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    wrapper.opacity(1);
    wrapper.x(0);
  }

  private resetFloatDown(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    wrapper.opacity(1);
    wrapper.x(0);
  }

  private resetScrollUp(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    wrapper.y(0);
  }

  private resetWipeIn(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    const target = context.konvaObject;
    wrapper.clip({ x: 0, y: 0, width: target.width(), height: target.height() });
  }

  private resetSpinIn(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    const target = context.konvaObject;
    wrapper.rotation(0);
    wrapper.opacity(1);
    wrapper.offset({ x: 0, y: 0 });
    wrapper.position({ x: target.x(), y: target.y() });
  }

  private handleFade(context: AnimationContext, duration?: number): void {
    const wrapper = context.konvaWrapper;
    const currentTime = context.currentTime;
    const totalDuration = duration ? duration * 1000 : 350;
    const progress = currentTime / totalDuration;
    wrapper.opacity(progress <= 1 ? progress : 1);
  }

  private handleFloatRight(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    const currentTime = context.currentTime;
    const progress = currentTime / 350;
    if (currentTime <= 350) {
      const ease = (value: number) => {
        const shifted = value - 1;
        return shifted * shifted * shifted + 1;
      };
      wrapper.opacity(progress);
      wrapper.x(-(100 - 100 * ease(progress)));
    }
  }

  private handleFloatLeft(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    const currentTime = context.currentTime;
    const progress = currentTime / 350;
    if (currentTime <= 350) {
      const ease = (value: number) => {
        const shifted = value - 1;
        return shifted * shifted * shifted + 1;
      };
      wrapper.opacity(progress);
      wrapper.x(100 - 100 * ease(progress));
    }
  }

  private handleFloatUp(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    const currentTime = context.currentTime;
    const progress = currentTime / 350;
    if (currentTime <= 350) {
      const ease = (value: number) => {
        const shifted = value - 1;
        return shifted * shifted * shifted + 1;
      };
      wrapper.opacity(progress);
      wrapper.y(100 - 100 * ease(progress));
    }
  }

  private handleFloatDown(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    const currentTime = context.currentTime;
    const progress = currentTime / 350;
    if (currentTime <= 350) {
      const ease = (value: number) => {
        const shifted = value - 1;
        return shifted * shifted * shifted + 1;
      };
      wrapper.opacity(progress);
      wrapper.y(-(100 - 100 * ease(progress)));
    }
  }

  private handleScrollUp(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    const target = context.konvaObject;
    const stage = context.stageSize;
    const progress = context.progress;
    wrapper.y(stage.height - target.y() - (progress / 100) * (target.y() + target.height() + stage.height));
  }

  private handleWipeIn(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    const target = context.konvaObject;
    const currentTime = context.currentTime;
    const progress = currentTime / 2000;
    if (currentTime <= 2000) {
      wrapper.clip({ x: 0, y: 0, width: progress * target.width(), height: target.height() });
    } else {
      wrapper.clip({ x: 0, y: 0, width: target.width(), height: target.height() });
    }
  }

  private handleSpinIn(context: AnimationContext): void {
    const wrapper = context.konvaWrapper;
    const target = context.konvaObject;
    const currentTime = context.currentTime;
    const progress = currentTime / 2000;
    wrapper.offset({ x: target.width() / 2, y: target.height() / 2 });
    wrapper.position({ x: target.x() + target.width() / 2, y: target.y() + target.height() / 2 });
    if (currentTime <= 2000) {
      wrapper.rotation(360 * (1 - progress));
      wrapper.opacity(progress);
    } else {
      wrapper.rotation(0);
      wrapper.opacity(1);
      wrapper.offset({ x: 0, y: 0 });
      wrapper.position({ x: target.x(), y: target.y() });
    }
  }
}
