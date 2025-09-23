export interface RatioPreset {
  name: string;
  idealRatioWidth: number;
  idealRatioHeight: number;
  resolutions: {
    hd: number;
  };
}

export const ratioPresets: Record<string, RatioPreset> = {
  '1:1': {
    name: 'Square',
    idealRatioWidth: 1,
    idealRatioHeight: 1,
    resolutions: {
      hd: 1920,
    },
  },
  '16:9': {
    name: 'Landscape',
    idealRatioWidth: 16,
    idealRatioHeight: 9,
    resolutions: {
      hd: 1920,
    },
  },
  '9:16': {
    name: 'Portrait',
    idealRatioWidth: 9,
    idealRatioHeight: 16,
    resolutions: {
      hd: 1080,
    },
  },
  '4:5': {
    name: 'Post Portrait',
    idealRatioWidth: 4,
    idealRatioHeight: 5,
    resolutions: {
      hd: 1080,
    },
  },
  '5:4': {
    name: 'Post Landscape',
    idealRatioWidth: 5,
    idealRatioHeight: 4,
    resolutions: {
      hd: 1350,
    },
  },
  '820:312': {
    name: 'Facebook Cover',
    idealRatioWidth: 820,
    idealRatioHeight: 312,
    resolutions: {
      hd: 1200,
    },
  },
  '2:3': {
    name: 'Pinterest',
    idealRatioWidth: 2,
    idealRatioHeight: 3,
    resolutions: {
      hd: 1200,
    },
  },
};

export default ratioPresets;
