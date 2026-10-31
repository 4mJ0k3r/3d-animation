import type { StoryPlan } from '../toon-kit/story';
/** Complete 10-second Hindi/English story. Data only; all timing is absolute. */
export const TEN_SECOND_STORY: StoryPlan = {
  version: 1,
  fps: 30,
  durationInFrames: 300,
  characters: {
    asha: {
      appearance: 'casual',
      expression: 'neutral'
    },
    ravi: {
      appearance: 'office',
      expression: 'neutral'
    }
  },
  scenes: [{
    id: 'arrival',
    setting: 'office',
    startFrame: 0,
    endFrame: 170,
    axis: ['asha', 'ravi'],
    characters: {
      asha: {
        stance: {
          type: 'stand',
          at: 'entry'
        }
      },
      ravi: {
        stance: {
          type: 'sit',
          seat: 'chair',
          floor: 'ground'
        }
      }
    },
    beats: [{
      id: 'arrive',
      startFrame: 0,
      endFrame: 60,
      actions: [{
        actor: 'asha',
        type: 'walk',
        path: 'toDesk'
      }]
    }, {
      id: 'show',
      startFrame: 60,
      endFrame: 120,
      actions: [{
        actor: 'asha',
        type: 'point',
        target: 'board',
        hand: 'auto'
      }]
    }, {
      id: 'attention',
      startFrame: 60,
      endFrame: 85,
      actions: [{
        actor: 'asha',
        type: 'look',
        target: 'board'
      }, {
        actor: 'ravi',
        type: 'look',
        target: 'board'
      }, {
        actor: 'asha',
        type: 'expression',
        name: 'explaining'
      }]
    }, {
      id: 'listen',
      startFrame: 85,
      endFrame: 115,
      actions: [{
        actor: 'ravi',
        type: 'gesture',
        name: 'nod'
      }]
    }, {
      id: 'reaction',
      startFrame: 120,
      endFrame: 160,
      actions: [{
        actor: 'ravi',
        type: 'react',
        name: 'surprised'
      }]
    }, {
      id: 'approve',
      startFrame: 160,
      endFrame: 170,
      actions: [{
        actor: 'ravi',
        type: 'expression',
        name: 'happy',
        transitionFrames: 6
      }]
    }],
    cues: [{
      id: 'arrival',
      kind: 'caption',
      text: 'A new idea',
      language: 'en',
      startFrame: 0,
      endFrame: 60,
      mode: 'words'
    }, {
      id: 'show',
      kind: 'dialogue',
      speaker: 'asha',
      text: 'Look at this plan',
      language: 'en',
      startFrame: 60,
      endFrame: 120,
      mode: 'words',
      alignmentId: 'asha-plan'
    }, {
      id: 'reaction',
      kind: 'dialogue',
      speaker: 'ravi',
      text: 'वाह! अच्छा विचार।',
      language: 'hi',
      startFrame: 120,
      endFrame: 170,
      mode: 'words',
      alignmentId: 'ravi-reaction'
    }],
    shots: [{
      id: 'arrival',
      type: 'fullBody',
      subject: 'asha',
      startFrame: 0,
      endFrame: 60
    }, {
      id: 'show',
      type: 'twoShot',
      subjects: ['asha', 'ravi'],
      startFrame: 60,
      endFrame: 120
    }, {
      id: 'reaction',
      type: 'reaction',
      subject: 'ravi',
      startFrame: 120,
      endFrame: 170,
      motion: {
        type: 'pushIn',
        amount: 'subtle'
      }
    }]
  }, {
    id: 'review',
    setting: 'meeting',
    startFrame: 170,
    endFrame: 300,
    axis: ['asha', 'ravi'],
    characters: {
      asha: {
        stance: {
          type: 'stand',
          at: 'finish'
        },
        lookAt: 'board',
        expression: 'happy'
      },
      ravi: {
        stance: {
          type: 'sit',
          seat: 'chair',
          floor: 'ground'
        },
        lookAt: 'board',
        expression: 'happy'
      }
    },
    beats: [{
      id: 'finish',
      startFrame: 230,
      endFrame: 255,
      actions: [{
        actor: 'asha',
        type: 'look',
        target: 'audience'
      }, {
        actor: 'ravi',
        type: 'look',
        target: 'audience'
      }]
    }, {
      id: 'explain',
      startFrame: 240,
      endFrame: 285,
      actions: [{
        actor: 'asha',
        type: 'gesture',
        name: 'explain',
        intensity: .45
      }]
    }],
    cues: [{
      id: 'plan',
      kind: 'caption',
      text: 'The plan is ready',
      language: 'en',
      startFrame: 170,
      endFrame: 230,
      mode: 'words'
    }, {
      id: 'finish',
      kind: 'dialogue',
      speaker: 'asha',
      text: 'Let us begin',
      language: 'en',
      startFrame: 230,
      endFrame: 300,
      mode: 'words'
    }],
    shots: [{
      id: 'plan',
      type: 'objectFocus',
      subject: 'board',
      region: 'full',
      startFrame: 170,
      endFrame: 230
    }, {
      id: 'finish',
      type: 'twoShot',
      subjects: ['asha', 'ravi'],
      startFrame: 230,
      endFrame: 300
    }]
  }]
};
