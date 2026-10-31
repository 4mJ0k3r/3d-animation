import type { StoryPlan } from '../toon-kit/story';
/** User-provided sentence intervals, not word alignment. Equal-spacing fallback is explicit. */
export const NARRATION_SEGMENTS = [{
  text: 'सोचो अगर दुनिया के सारे 800 करोड़ लोग कल सुबह सिर्फ एक ही शहर में शिफ्ट हो जाएं,',
  startSeconds: 0,
  endSeconds: 4.6
}, {
  text: 'सुनने में कूल लगता है,',
  startSeconds: 4.8,
  endSeconds: 6.2
}, {
  text: 'पर पहले दिन ही भयंकर कांड हो जाएगा।',
  startSeconds: 6.4,
  endSeconds: 9.2
}] as const;
export const AUDIO_STORY: StoryPlan = {
  version: 1,
  fps: 30,
  durationInFrames: 288,
  characters: {
    asha: {
      appearance: 'casual',
      expression: 'happy'
    },
    ravi: {
      appearance: 'office',
      expression: 'neutral'
    }
  },
  audio: {
    assets: {
      narrator: {
        src: 'audio/phase4b-narration.mp3',
        durationInSeconds: 11.889
      }
    },
    clips: [{
      id: 'narration',
      kind: 'narration',
      asset: 'narrator',
      startFrame: 0,
      endFrame: 288,
      volume: .9
    }]
  },
  scenes: [{
    id: 'idea',
    setting: 'office',
    startFrame: 0,
    endFrame: 288,
    axis: ['asha', 'ravi'],
    characters: {
      asha: {
        stance: {
          type: 'stand',
          at: 'finish'
        },
        lookAt: {
          actor: 'ravi'
        }
      },
      ravi: {
        stance: {
          type: 'sit',
          seat: 'chair',
          floor: 'ground'
        },
        lookAt: {
          actor: 'asha'
        }
      }
    },
    beats: [{
      id: 'consider',
      startFrame: 144,
      endFrame: 180,
      actions: [{
        actor: 'ravi',
        type: 'gesture',
        name: 'nod'
      }]
    }, {
      id: 'consequence',
      startFrame: 192,
      endFrame: 276,
      actions: [{
        actor: 'asha',
        type: 'react',
        name: 'worried'
      }]
    }],
    cues: NARRATION_SEGMENTS.map((s, i) => ({
      id: 'sentence' + i,
      alignmentId: 'narration/sentence' + i,
      kind: 'caption' as const,
      text: s.text,
      language: 'hi' as const,
      startFrame: Math.round(s.startSeconds * 30),
      endFrame: Math.round(s.endSeconds * 30),
      mode: 'words' as const,
      timing: 'estimated' as const
    })),
    shots: [{
      id: 'idea',
      type: 'twoShot',
      subjects: ['asha', 'ravi'],
      startFrame: 0,
      endFrame: 144
    }, {
      id: 'listen',
      type: 'closeUp',
      subject: 'ravi',
      startFrame: 144,
      endFrame: 192
    }, {
      id: 'reaction',
      type: 'reaction',
      subject: 'asha',
      startFrame: 192,
      endFrame: 288
    }]
  }]
};
