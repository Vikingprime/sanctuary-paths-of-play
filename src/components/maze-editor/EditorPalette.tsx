/**
 * Editor Palette - Draggable sidebar with character templates and obstacle templates
 * 
 * Items are dragged from here onto the grid to place them.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// Character templates available for placement
const CHARACTER_TEMPLATES = [
  { model: 'Farmer.glb', emoji: '👨‍🌾', name: 'Farmer', defaultAnimation: 'idle' },
  { model: 'Animated_Woman.glb', emoji: '👩', name: 'Woman', defaultAnimation: 'idle' },
  { model: 'Cow.glb', emoji: '🐮', name: 'Cow', defaultAnimation: 'idle' },
  { model: 'Pig.glb', emoji: '🐷', name: 'Pig', defaultAnimation: 'idle' },
  { model: 'Hen.glb', emoji: '🐔', name: 'Hen', defaultAnimation: 'idle' },
  { model: 'Hen_idle.glb', emoji: '🐔', name: 'Hen (idle)', defaultAnimation: 'idle' },
  { model: 'Hen_walk.glb', emoji: '🐔', name: 'Hen (walk)', defaultAnimation: 'walk' },
  { model: 'Rat.glb', emoji: '🐀', name: 'Rat', defaultAnimation: 'idle' },
  { model: 'Hamster.glb', emoji: '🐹', name: 'Hamster', defaultAnimation: 'idle' },
  { model: 'Kangaroo_rat.glb', emoji: '🐁', name: 'Kangaroo Rat', defaultAnimation: 'idle' },
  { model: 'Squirrel.glb', emoji: '🐿️', name: 'Squirrel', defaultAnimation: 'idle' },
  { model: 'Rat-2.glb', emoji: '🐀', name: 'Rat 2', defaultAnimation: 'idle' },
  { model: 'Spiny_mouse.glb', emoji: '🐭', name: 'Spiny Mouse', defaultAnimation: 'idle' },
  { model: 'Sparrow.glb', emoji: '🐦', name: 'Sparrow', defaultAnimation: 'idle' },
  { model: 'Bush_with_Berries.glb', emoji: '🫐', name: 'Bush', defaultAnimation: 'idle' },
];

const OBSTACLE_TEMPLATES = [
  { model: 'Log.glb', emoji: '🪵', name: 'Log' },
  { model: 'Log_with_Fungus.glb', emoji: '🍄', name: 'Log (Fungus)' },
];

const PUSHABLE_BARREL_TEMPLATES = [
  { model: 'Barrel.glb', emoji: '🛢️', name: 'Barrel (push)' },
  { model: 'Barrel_1.glb', emoji: '🪣', name: 'Barrel 2 (push)' },
  { model: 'Beer_Keg.glb', emoji: '🍺', name: 'Keg (push)' },
];

// Drag data types
export const DRAG_TYPE_CHARACTER = 'maze-editor/character';
export const DRAG_TYPE_OBSTACLE = 'maze-editor/obstacle';
export const DRAG_TYPE_PUSHABLE_BARREL = 'maze-editor/pushable-barrel';
export const DRAG_TYPE_PLACED_CHARACTER = 'maze-editor/placed-character';
export const DRAG_TYPE_PLACED_OBSTACLE = 'maze-editor/placed-obstacle';
export const DRAG_TYPE_PLACED_PUSHABLE_BARREL = 'maze-editor/placed-pushable-barrel';

export interface DragCharacterData {
  type: 'new-character';
  model: string;
  emoji: string;
  name: string;
  defaultAnimation: string;
}

export interface DragObstacleData {
  type: 'new-obstacle';
  model: string;
}

export interface DragPlacedCharacterData {
  type: 'placed-character';
  characterId: string;
}

export interface DragPlacedObstacleData {
  type: 'placed-obstacle';
  obstacleId: string;
}

export interface DragPushableBarrelData {
  type: 'new-pushable-barrel';
  model: string;
}

export interface DragPlacedPushableBarrelData {
  type: 'placed-pushable-barrel';
  barrelId: string;
}

interface PaletteItemProps {
  emoji: string;
  name: string;
  dragType: string;
  dragData: string;
}

const PaletteItem: React.FC<PaletteItemProps> = ({ emoji, name, dragType, dragData }) => {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(dragType, dragData);
        e.dataTransfer.effectAllowed = 'copy';
        // Create a drag image
        const ghost = document.createElement('div');
        ghost.textContent = emoji;
        ghost.style.cssText = 'font-size: 24px; position: absolute; top: -100px;';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 12, 12);
        setTimeout(() => document.body.removeChild(ghost), 0);
      }}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing
        hover:bg-accent/50 border border-transparent hover:border-border transition-colors select-none"
      title={`Drag onto grid to place ${name}`}
    >
      <span className="text-lg w-7 text-center">{emoji}</span>
      <span className="text-xs font-medium truncate">{name}</span>
    </div>
  );
};

interface EditorPaletteProps {
  className?: string;
}

export const EditorPalette: React.FC<EditorPaletteProps> = ({ className }) => {
  return (
    <Card className={`shrink-0 ${className || ''}`}>
      <CardHeader className="pb-2 px-3 pt-3">
        <CardTitle className="text-sm">Palette</CardTitle>
        <p className="text-xs text-muted-foreground">Drag items onto the grid</p>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-3 pr-2">
            {/* Characters */}
            <div>
              <Label className="text-xs font-semibold px-2 text-muted-foreground uppercase tracking-wider">
                Characters
              </Label>
              <div className="mt-1 space-y-0.5">
                {CHARACTER_TEMPLATES.map(t => (
                  <PaletteItem
                    key={t.model}
                    emoji={t.emoji}
                    name={t.name}
                    dragType={DRAG_TYPE_CHARACTER}
                    dragData={JSON.stringify({
                      type: 'new-character',
                      model: t.model,
                      emoji: t.emoji,
                      name: t.name,
                      defaultAnimation: t.defaultAnimation,
                    } as DragCharacterData)}
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Obstacles */}
            <div>
              <Label className="text-xs font-semibold px-2 text-muted-foreground uppercase tracking-wider">
                Obstacles
              </Label>
              <div className="mt-1 space-y-0.5">
                {OBSTACLE_TEMPLATES.map(t => (
                  <PaletteItem
                    key={t.model}
                    emoji={t.emoji}
                    name={t.name}
                    dragType={DRAG_TYPE_OBSTACLE}
                    dragData={JSON.stringify({
                      type: 'new-obstacle',
                      model: t.model,
                    } as DragObstacleData)}
                  />
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export { CHARACTER_TEMPLATES, OBSTACLE_TEMPLATES };
