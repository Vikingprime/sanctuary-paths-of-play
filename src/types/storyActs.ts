// Branched Story Mode types

export interface StoryNode {
  id: string;
  title: string;
  description: string;
  emoji: string;
  timed: boolean;
  mazeId?: number; // Links to a StoryMaze id. undefined = not yet implemented
  unlocks?: string[]; // Node IDs that become available after completing this node
  requiresAll?: string[]; // ALL listed node IDs must be complete to unlock this node
  requiresAny?: string[]; // ANY of the listed node IDs must be complete (unused if requiresAll set)
  branchLabel?: string; // Label for the branch group (e.g., "Feast Items")
  implemented?: boolean; // Whether the maze is playable (default false)
}

export interface StoryAct {
  id: string;
  actNumber: number;
  title: string;
  subtitle: string;
  description: string;
  emoji: string;
  nodes: StoryNode[];
  startNodeId: string;
  unlockCondition?: { actId: string }; // Previous act must be fully completed
}

export interface BranchedStoryProgress {
  completedNodes: string[]; // node IDs
  currentActId: string;
  unlockedActs: string[];
  stars: number;
}
