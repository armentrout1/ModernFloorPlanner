# Doors and Windows Functionality Documentation

## ⚠️ CRITICAL FEATURE - READ BEFORE MAKING ANY CHANGES

This document describes the complete doors and windows system in the floor planner application. This functionality is complex and interdependent - changes to any related file can break the entire system.

## Core Behavior Overview

### Door and Window Placement
- Users select door or window tool from sidebar
- Click on any room wall to place the object
- Objects snap to walls with precise positioning
- Real-time conflict detection prevents overlapping objects
- Visual feedback shows valid/invalid placement locations

### Drag and Drop System
- Doors and windows can be dragged between walls and rooms
- Complex state management tracks dragging state
- Visual highlights show valid drop targets
- Automatic conflict resolution during moves
- Preserves object properties during relocation

### Property Management
- Door properties: width, style (single/double/sliding/bifold), swing direction, swing side
- Window properties: width, height
- Properties are editable through the property panel
- Standard door sizes available (24", 28", 30", 32", 36")
- Property changes update visual representation immediately

## Technical Implementation

### Key Components and Their Roles

#### CanvasContainer.tsx - CORE LOGIC
- **Purpose**: Primary coordination hub for all door/window interactions
- **Critical Functions**:
  - `handleWallClick()`: Places new objects on walls
  - `hasConflictingObjects()`: Prevents object overlap
  - `hasAdjoiningRoomConflict()`: Checks multi-room conflicts
  - Door drag state management (`doorState`)
  - Mouse event handling for placement and dragging

#### PropertyPanel.tsx - PROPERTY EDITING
- **Purpose**: UI for editing door and window properties
- **Critical Functions**:
  - Door style selection (single, double, sliding, bifold)
  - Swing direction and side controls
  - Standard door size dropdown
  - Real-time property updates

#### RoomBox.tsx - WALL RENDERING
- **Purpose**: Renders rooms with doors and windows integrated into walls
- **Critical Functions**:
  - `renderWallSegments()`: Creates wall breaks for doors/windows
  - Wall click detection for object placement
  - Object positioning on walls
  - Multi-selection support

#### RoomObject.tsx - OBJECT RENDERING
- **Purpose**: Renders individual door and window objects
- **Critical Functions**:
  - Visual representation of different door styles
  - Drag handle functionality
  - Selection state management
  - Scale-aware rendering

### Data Flow

1. **Tool Selection**: User selects door/window tool in Sidebar.tsx
2. **Wall Click**: CanvasContainer detects wall clicks and calculates position
3. **Conflict Check**: System validates placement location
4. **Object Creation**: New door/window object added to room data
5. **Visual Update**: RoomBox re-renders with new object
6. **Property Editing**: PropertyPanel allows modification of object properties

### State Management

#### Door State (`doorState`)
```typescript
{
  mode: 'idle' | 'dragging',
  draggedDoor?: {
    objectId: string,
    sourceRoomId: string,
    object: RoomObject
  },
  previewPosition?: Position,
  targetWall?: {
    roomId: string,
    wallSide: WallSide,
    position: number
  }
}
```

#### Object Data Structure
```typescript
{
  id: string,
  type: 'door' | 'window',
  wallSide: 'top' | 'right' | 'bottom' | 'left',
  position: number, // Percentage along wall (0-100)
  size: number, // Width in pixels
  doorProperties?: {
    width: number,
    height: number,
    style: DoorStyle,
    swingDirection: SwingDirection,
    swingSide: SwingSide
  }
}
```

## Critical Interaction Patterns

### Wall Click Detection
- Calculates which wall segment was clicked
- Converts click position to percentage along wall
- Validates minimum distance from corners and other objects

### Conflict Resolution
- Objects must be at least 12 pixels apart
- Cannot place objects at wall corners (first/last 10%)
- Checks for conflicts in adjoining rooms for shared walls
- Prevents placement if conflicts detected

### Drag and Drop Flow
1. Mouse down on object starts drag mode
2. Mouse move updates preview position and target wall
3. Visual feedback highlights valid drop zones
4. Mouse up commits the move or cancels if invalid
5. Object data updated in room state

### Property Updates
- Property changes trigger immediate visual updates
- Door size changes affect wall segment rendering
- Style changes update object appearance
- All changes preserve object positioning

## Material Calculation Integration

Doors and windows affect material calculations:
- **Baseboards**: Reduced by door width, unaffected by windows
- **Door Count**: Total doors tracked for material lists
- **Window Count**: Total windows tracked
- **Door Sizes**: Grouped by width for accurate material ordering

## Testing Scenarios

Before making changes, verify these scenarios still work:

### Basic Placement
- [ ] Can place doors on all four walls of a room
- [ ] Can place windows on all four walls of a room
- [ ] Objects cannot overlap with existing objects
- [ ] Objects cannot be placed too close to corners

### Drag and Drop
- [ ] Can drag doors between walls in same room
- [ ] Can drag doors between different rooms
- [ ] Cannot drop on invalid locations
- [ ] Visual feedback shows valid/invalid drop zones
- [ ] Object properties preserved during moves

### Property Editing
- [ ] Door width changes update visual size
- [ ] Door style changes update appearance
- [ ] Swing direction toggles work correctly
- [ ] Property panel shows correct values for selected object

### Multi-Room Interactions
- [ ] Objects on shared walls don't conflict
- [ ] Material calculations include all objects
- [ ] Room resizing handles object positioning correctly

## Known Dependencies

### File Dependencies
- `shared/schema.ts`: Data type definitions
- `client/src/utils/canvas.ts`: Position calculation utilities
- `client/src/utils/materialCalculator.ts`: Material calculation logic

### Component Dependencies
- Sidebar → CanvasContainer (tool selection)
- CanvasContainer → RoomBox (object placement)
- RoomBox → RoomObject (object rendering)
- PropertyPanel → CanvasContainer (property updates)

### State Dependencies
- Room state contains object arrays
- Selected object ID tracked in parent state
- Tool selection affects click behavior
- Scale affects visual rendering

## Development Guidelines

### Making Changes Safely
1. **Always test placement after changes**
2. **Verify drag and drop still works**
3. **Check property panel updates correctly**
4. **Test material calculations remain accurate**
5. **Validate multi-room scenarios**

### Common Pitfalls
- Changing position calculations can break wall detection
- Modifying object data structure requires schema updates
- State updates must be immutable for React re-rendering
- Scale changes affect pixel-based calculations

### Future Enhancements
- Consider adding more door styles
- Window opening directions
- Custom door/window sizes
- Object rotation capabilities
- Advanced conflict resolution

## Emergency Rollback

If changes break doors/windows functionality:
1. Revert all files marked with "DOORS & WINDOWS" headers
2. Test basic placement scenario
3. If still broken, check for schema changes in shared/schema.ts
4. Verify material calculator hasn't been modified

---

**Last Updated**: June 1, 2025  
**Feature Status**: Stable and Working  
**Critical Level**: HIGH - Core Application Feature