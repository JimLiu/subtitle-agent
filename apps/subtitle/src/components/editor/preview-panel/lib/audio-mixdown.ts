export function mixdownBuffer(input: AudioBuffer): Float32Array<ArrayBuffer> {
  const { length, numberOfChannels } = input;
  if (numberOfChannels < 2) {
    return input.getChannelData(0).slice();
  }

  const output = new Float32Array(length);
  for (let channelIndex = 0; channelIndex < numberOfChannels; channelIndex += 1) {
    const channel = input.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < length; sampleIndex += 1) {
      output[sampleIndex] += channel[sampleIndex];
    }
  }
  return output;
}
