// Quest and Story Mode types

export type QuestObjectiveType = 'talk_to' | 'collect' | 'reach' | 'report_back';

export interface QuestObjective {
  id: string;
  type: QuestObjectiveType;
  description: string;
  targetCharacterId?: string; // For 'talk_to' and 'report_back' objectives
  targetPosition?: { x: number; y: number }; // For 'reach' objectives
  itemId?: string; // For 'collect' objectives
  completed: boolean;
  hidden?: boolean; // If true, don't show on preview map (e.g., hidden NPCs)
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  objectives: QuestObjective[];
  rewards?: {
    stars?: number;
    medal?: boolean;
  };
  nextQuestId?: string; // Chain to next quest
}

export interface StoryChapter {
  id: string;
  title: string;
  description: string;
  quests: Quest[];
  mazeId: number; // Which maze this chapter uses
  unlockCondition?: {
    chapterId: string;
    questId: string;
  };
}

export interface StoryProgress {
  currentChapterId: string;
  currentQuestId: string;
  completedQuests: string[];
  completedChapters: string[];
  activeObjectives: Record<string, boolean>; // objectiveId -> completed
}

// Dialogue extensions for quest system
export interface QuestDialogueAction {
  type: 'complete_objective' | 'start_quest' | 'unlock_chapter';
  objectiveId?: string;
  questId?: string;
  chapterId?: string;
}

export type GameMode = 'story' | 'time_trial';

// Story-specific character that's hidden from preview
export interface StoryCharacter {
  id: string;
  name: string;
  emoji: string;
  model: string;
  animation: string;
  position: { x: number; y: number };
  hiddenFromPreview: boolean; // Always true for quest NPCs
  questRelevant?: string; // Which quest objective this relates to
}
