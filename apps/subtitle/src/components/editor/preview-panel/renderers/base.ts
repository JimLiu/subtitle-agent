import Konva from 'konva';

import {
  PreviewSegment,
  SegmentAnimation,
  SegmentPosition,
  SegmentScale,
} from '../deps/segment-types';

export interface BaseRendererOptions<T extends PreviewSegment> {
  segment: T;
  container: Konva.Group;
  stage: Konva.Stage;
  updateSegment: (payload: Partial<PreviewSegment> & { id: string }) => void | Promise<void>;
}

export interface RendererFrameContext {
  timestamp: number;
  playing: boolean;
  stageSize: { width: number; height: number };
  scale: number;
}

export interface RendererFrameInfo {
  progress: number;
  localFrame: number;
  localTime: number;
  stageSize: { width: number; height: number };
  scale: number;
}

export abstract class BaseRenderer<T extends PreviewSegment> {
  protected segment: T;
  protected readonly container: Konva.Group;
  protected readonly stage: Konva.Stage;
  protected readonly updateSegmentAction: (payload: Partial<PreviewSegment> & { id: string }) => void | Promise<void>;

  protected wrapper: Konva.Group | null = null;
  protected node: Konva.Node | null = null;
  protected visible = false;
  protected playing = false;
  protected currentTimestamp = 0;
  protected stageSize = { width: 0, height: 0 };
  protected stageScale = 1;
  protected localTime = 0;
  protected localFrame = 0;
  protected progress = 0;

  private animationsApplied = false;

  constructor(options: BaseRendererOptions<T>) {
    this.segment = options.segment;
    this.container = options.container;
    this.stage = options.stage;
    this.updateSegmentAction = options.updateSegment;
  }

  async initialize(): Promise<void> {
    this.wrapper = new Konva.Group({ id: this.segment.id });
    this.wrapper.addName('konvaWrapper');
    this.container.add(this.wrapper);

    const node = await this.createNode();
    this.node = node;
    node.id(this.segment.id);
    node.name(this.segment.id);
    node.draggable(true);
    node.on('dragend', this.handleDragEnd);
    node.on('transform', this.handleTransform);
    node.on('transformend', this.handleTransformEnd);

    this.wrapper.add(node as Konva.Group);
    this.applyBaseProperties();
    this.onNodeReady(node);
    this.resetAnimations();

    this.hide();
    this.container.getLayer()?.batchDraw();
  }

  update(segment: T): void {
    const previous = this.segment;
    this.segment = segment;
    if (this.node) {
      this.applyBaseProperties();
      this.onSegmentUpdated(segment, previous);
    }
    if (this.animationsChanged(previous, segment)) {
      this.resetAnimations();
    }
  }

  setZIndex(index: number): void {
    this.wrapper?.zIndex(index);
  }

  syncVisibility(timestamp: number): void {
    this.currentTimestamp = timestamp;
    const shouldBeVisible = timestamp >= this.segment.startTime && timestamp <= this.segment.endTime;
    if (shouldBeVisible && !this.visible) {
      this.show();
    } else if (!shouldBeVisible && this.visible) {
      this.hide();
    }
    this.onTimeUpdate(timestamp);
  }

  handlePlayingChange(isPlaying: boolean): void {
    this.playing = isPlaying;
    this.onPlayingChange(isPlaying);
  }

  frameUpdate(context: RendererFrameContext): void {
    this.stageSize = { ...context.stageSize };
    this.stageScale = context.scale;
    this.currentTimestamp = context.timestamp;
    this.playing = context.playing;

    const start = this.segment.startTime ?? 0;
    const end = this.segment.endTime ?? this.segment.startTime ?? 0;
    const duration = Math.max(end - start, 1);
    const rawLocalTime = context.timestamp - start;
    this.localTime = rawLocalTime > 0 ? rawLocalTime : 0;
    this.localFrame = Math.round((this.localTime / 1000) * 60);
    this.progress = Math.min(Math.max((this.localTime / duration) * 100, 0), 100);

    if (this.segment.animations?.length) {
      if (context.playing && this.visible) {
        this.applyAnimations();
        this.animationsApplied = true;
      } else if (this.animationsApplied) {
        this.resetAnimations();
        this.animationsApplied = false;
      }
    }

    this.onFrame({
      progress: this.progress,
      localFrame: this.localFrame,
      localTime: this.localTime,
      stageSize: this.stageSize,
      scale: this.stageScale,
    });
  }

  destroy(): void {
    this.onDestroy();
    if (this.node) {
      this.node.off('dragend', this.handleDragEnd);
      this.node.off('transform', this.handleTransform);
      this.node.off('transformend', this.handleTransformEnd);
      this.node.destroy();
      this.node = null;
    }
    this.wrapper?.destroy();
    this.wrapper = null;
  }

  protected abstract createNode(): Promise<Konva.Node> | Konva.Node;

  protected onNodeReady(_node: Konva.Node): void {}

  protected onSegmentUpdated(_segment: T, _previous: T): void {}

  protected onTimeUpdate(_timestamp: number): void {}

  protected onPlayingChange(_isPlaying: boolean): void {}

  protected onFrame(_info: RendererFrameInfo): void {}

  protected onDestroy(): void {}

  protected onDragEnd(_event: Konva.KonvaEventObject<DragEvent | TouchEvent>): boolean {
    return false;
  }

  protected onTransform(_event: Konva.KonvaEventObject<Event>): boolean {
    return false;
  }

  protected onTransformEnd(_event: Konva.KonvaEventObject<Event>): boolean {
    return false;
  }

  async prepareForFrame(_timestamp: number): Promise<void> {
    // Default implementation has nothing to prepare before a frame capture.
  }

  protected show(): void {
    if (!this.wrapper) {
      return;
    }
    this.visible = true;
    this.animationsApplied = false;
    this.wrapper.show();
    this.container.getLayer()?.batchDraw();
  }

  protected hide(): void {
    if (!this.wrapper) {
      return;
    }
    this.resetAnimations();
    this.animationsApplied = false;
    this.visible = false;
    this.wrapper.hide();
    this.container.getLayer()?.batchDraw();
  }

  protected applyBaseProperties(): void {
    if (!this.node) {
      return;
    }
    const { position, scale, rotation, opacity } = this.segment;
    this.node.position({ x: position?.x ?? 0, y: position?.y ?? 0 });
    const effectiveScale: SegmentScale = scale ?? { x: 1, y: 1 };
    this.node.scale({ x: effectiveScale.x ?? 1, y: effectiveScale.y ?? 1 });
    this.node.rotation(rotation ?? 0);
    this.node.opacity(opacity ?? 1);
  }

  protected updateSegment(values: Partial<PreviewSegment>): void {
    void this.updateSegmentAction({ id: this.segment.id, ...values });
  }

  protected resetAnimations(): void {
    if (!this.wrapper || !this.node) {
      return;
    }
    (this.segment.animations ?? []).forEach((animation) => {
      switch (animation.type) {
        case 'fadeIn':
          this.resetFade();
          break;
        case 'floatRight':
          this.resetFloatRight();
          break;
        case 'floatLeft':
          this.resetFloatLeft();
          break;
        case 'floatUp':
          this.resetFloatUp();
          break;
        case 'floatDown':
          this.resetFloatDown();
          break;
        case 'scrollUp':
          this.resetScrollUp();
          break;
        case 'wipeIn':
          this.resetWipeIn();
          break;
        case 'spinIn':
          this.resetSpinIn();
          break;
        default:
          break;
      }
    });
  }

  private applyAnimations(): void {
    if (!this.wrapper || !this.node) {
      return;
    }
    (this.segment.animations ?? []).forEach((animation) => {
      switch (animation.type) {
        case 'fadeIn':
          this.applyFade(animation);
          break;
        case 'floatRight':
          this.applyFloatRight();
          break;
        case 'floatLeft':
          this.applyFloatLeft();
          break;
        case 'floatUp':
          this.applyFloatUp();
          break;
        case 'floatDown':
          this.applyFloatDown();
          break;
        case 'scrollUp':
          this.applyScrollUp();
          break;
        case 'wipeIn':
          this.applyWipeIn();
          break;
        case 'spinIn':
          this.applySpinIn();
          break;
        default:
          break;
      }
    });
  }

  private applyFade(animation: SegmentAnimation): void {
    if (!this.wrapper) {
      return;
    }
    const duration = animation.duration ? animation.duration * 1000 : 350;
    const progress = Math.min(this.localTime / duration, 1);
    this.wrapper.opacity(progress);
  }

  private applyFloatRight(): void {
    if (!this.wrapper) {
      return;
    }
    const progress = Math.min(this.localTime / 350, 1);
    const ease = (value: number) => {
      const shifted = value - 1;
      return shifted * shifted * shifted + 1;
    };
    this.wrapper.opacity(progress);
    this.wrapper.x(-(100 - 100 * ease(progress)));
  }

  private applyFloatLeft(): void {
    if (!this.wrapper) {
      return;
    }
    const progress = Math.min(this.localTime / 350, 1);
    const ease = (value: number) => {
      const shifted = value - 1;
      return shifted * shifted * shifted + 1;
    };
    this.wrapper.opacity(progress);
    this.wrapper.x(100 - 100 * ease(progress));
  }

  private applyFloatUp(): void {
    if (!this.wrapper) {
      return;
    }
    const progress = Math.min(this.localTime / 350, 1);
    const ease = (value: number) => {
      const shifted = value - 1;
      return shifted * shifted * shifted + 1;
    };
    this.wrapper.opacity(progress);
    this.wrapper.y(100 - 100 * ease(progress));
  }

  private applyFloatDown(): void {
    if (!this.wrapper) {
      return;
    }
    const progress = Math.min(this.localTime / 350, 1);
    const ease = (value: number) => {
      const shifted = value - 1;
      return shifted * shifted * shifted + 1;
    };
    this.wrapper.opacity(progress);
    this.wrapper.y(-(100 - 100 * ease(progress)));
  }

  private applyScrollUp(): void {
    if (!this.wrapper || !this.node) {
      return;
    }
    const target = this.node as Konva.Shape;
    const height = this.stageSize.height || this.stage.height();
    const nodeHeight = 'height' in this.node ? target.height() : target.getClientRect().height;
    const nodeY = this.node.y();
    this.wrapper.y(height - nodeY - (this.progress / 100) * (nodeY + nodeHeight + height));
  }

  private applyWipeIn(): void {
    if (!this.wrapper || !this.node) {
      return;
    }
    const target = this.node as Konva.Shape;
    const width = target.width?.() ?? target.getClientRect().width;
    const height = target.height?.() ?? target.getClientRect().height;
    const progress = Math.min(this.localTime / 2000, 1);
    this.wrapper.clip({ x: 0, y: 0, width: progress * width, height });
  }

  private applySpinIn(): void {
    if (!this.wrapper || !this.node) {
      return;
    }
    const target = this.node as Konva.Shape;
    const width = target.width?.() ?? target.getClientRect().width;
    const height = target.height?.() ?? target.getClientRect().height;
    const progress = Math.min(this.localTime / 2000, 1);
    this.wrapper.offset({ x: width / 2, y: height / 2 });
    this.wrapper.position({ x: target.x() + width / 2, y: target.y() + height / 2 });
    this.wrapper.rotation(360 * (1 - progress));
    this.wrapper.opacity(progress);
    if (progress >= 1) {
      this.wrapper.rotation(0);
      this.wrapper.opacity(1);
      this.wrapper.offset({ x: 0, y: 0 });
      this.wrapper.position({ x: target.x(), y: target.y() });
    }
  }

  private resetFade(): void {
    this.wrapper?.opacity(1);
  }

  private resetFloatRight(): void {
    if (!this.wrapper) {
      return;
    }
    this.wrapper.opacity(1);
    this.wrapper.x(0);
  }

  private resetFloatLeft(): void {
    if (!this.wrapper) {
      return;
    }
    this.wrapper.opacity(1);
    this.wrapper.x(0);
  }

  private resetFloatUp(): void {
    if (!this.wrapper) {
      return;
    }
    this.wrapper.opacity(1);
    this.wrapper.y(0);
  }

  private resetFloatDown(): void {
    if (!this.wrapper) {
      return;
    }
    this.wrapper.opacity(1);
    this.wrapper.y(0);
  }

  private resetScrollUp(): void {
    this.wrapper?.y(0);
  }

  private resetWipeIn(): void {
    if (!this.wrapper || !this.node) {
      return;
    }
    const target = this.node as Konva.Shape;
    const width = target.width?.() ?? target.getClientRect().width;
    const height = target.height?.() ?? target.getClientRect().height;
    this.wrapper.clip({ x: 0, y: 0, width, height });
  }

  private resetSpinIn(): void {
    if (!this.wrapper || !this.node) {
      return;
    }
    const target = this.node as Konva.Shape;
    this.wrapper.rotation(0);
    this.wrapper.opacity(1);
    this.wrapper.offset({ x: 0, y: 0 });
    this.wrapper.position({ x: target.x(), y: target.y() });
  }

  private animationsChanged(previous: PreviewSegment, next: PreviewSegment): boolean {
    const prior = previous.animations ?? [];
    const current = next.animations ?? [];
    if (prior.length !== current.length) {
      return true;
    }
    return prior.some((animation, index) => animation.type !== current[index]?.type);
  }

  private handleDragEnd = (event: Konva.KonvaEventObject<DragEvent | TouchEvent>) => {
    if (this.onDragEnd(event)) {
      return;
    }
    const target = event.target;
    const position: SegmentPosition = { x: target.x(), y: target.y() };
    this.updateSegment({ position });
  };

  private handleTransform = (event: Konva.KonvaEventObject<Event>) => {
    if (this.onTransform(event)) {
      return;
    }
  };

  private handleTransformEnd = (event: Konva.KonvaEventObject<Event>) => {
    if (this.onTransformEnd(event)) {
      return;
    }
    const target = event.target;
    const position: SegmentPosition = { x: target.x(), y: target.y() };
    const scale: SegmentScale = { x: target.scaleX(), y: target.scaleY() };
    const rotation = target.rotation();
    this.updateSegment({ position, scale, rotation });
  };
}
