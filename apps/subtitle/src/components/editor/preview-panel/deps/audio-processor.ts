import cloneDeep from 'lodash/cloneDeep';

import { uniqueId } from './unique-id';
import { resolve, updateExistingProps } from './object-utils';

type PlainObject = Record<string, unknown>;

const IGNORED_KEYS = ['id', 'name', 'properties', 'displays', 'effects'];

/**
 * 可配置的音频处理器基类：
 * - 统一管理 id/name/properties 与启用状态；
 * - 提供 update/序列化等通用能力；
 * - 由具体子类（如 SpectrumAnalyzer/FftParser）继承实现。
 */
export default class AudioProcessor<TProperties extends PlainObject = PlainObject> {
  public id: number;

  public readonly name: string;

  public readonly properties: TProperties;

  public enabled = true;

  public type?: string;

  constructor(name: string, properties: TProperties) {
    this.id = uniqueId();
    this.name = name;
    this.properties = properties;
  }

  update(update: Partial<TProperties> = {}): boolean {
    return updateExistingProps(this.properties, resolve(update, [this.properties]));
  }

  toString(): string {
    return `[${this.name} ${this.id}]`;
  }

  toJSON(): PlainObject {
    const { id, name, type, enabled, properties } = this;
    return {
      id,
      name,
      type,
      enabled,
      properties: cloneDeep(properties),
    };
  }

  static create<TProperties extends PlainObject>(
    Processor: new (properties: TProperties) => AudioProcessor<TProperties>,
    config: PlainObject,
  ): AudioProcessor<TProperties> {
    const { id, properties, ...rest } = config;
    const instance = new Processor(properties as TProperties);
    Object.entries(rest)
      .filter(([key]) => !IGNORED_KEYS.includes(key))
      .forEach(([key, value]) => {
        (instance as PlainObject)[key] = value;
      });
    if (typeof id === 'number') {
      instance.id = id;
    }
    return instance;
  }
}
