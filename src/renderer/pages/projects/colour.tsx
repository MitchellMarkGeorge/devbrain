import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  EntityPill,
  ProjectGlyph,
  SWATCHES,
  SwatchDot,
  type Swatch,
} from '../../components';
import { SWATCH_HEX, swatchOf } from '../../workspace/colors';

// A project's colour: stored as #rrggbb (`projects.update` takes only that), picked from the six
// swatches, as a workspace's is (`workspace/colors.ts`).

export const swatchName = (swatch: Swatch) => swatch[0].toUpperCase() + swatch.slice(1);

/** The swatches as radio items with their folder: the "…" menu's Change colour ›, and the pill's. */
export function ColourItems({
  color,
  onChange,
}: {
  /** the project's stored colour; drawn as its nearest swatch */
  color: string | null;
  onChange: (hex: string) => void;
}) {
  return (
    <DropdownMenuRadioGroup
      value={swatchOf(color)}
      onValueChange={(swatch: string) => onChange(SWATCH_HEX[swatch as Swatch])}
    >
      {SWATCHES.map((swatch) => (
        <DropdownMenuRadioItem key={swatch} value={swatch} icon={<ProjectGlyph color={swatch} />}>
          {swatchName(swatch)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/** The colour as a pill ("● Blue") that opens the swatches: the Create project dialog's. */
export function ColourPill({
  color,
  onChange,
}: {
  color: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const swatch = swatchOf(color);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <EntityPill interactive glyph={<SwatchDot color={swatch} />} aria-label="Colour">
            {swatchName(swatch)}
          </EntityPill>
        }
      />
      <DropdownMenuContent width="sm" align="start">
        <ColourItems
          color={color}
          onChange={(hex) => {
            onChange(hex);
            setOpen(false);
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
