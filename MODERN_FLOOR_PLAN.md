# Modern Floor Plan Application Documentation

## Overview

The Modern Floor Plan Application is a sophisticated React-based web application designed for creating, editing, and managing architectural floor plans. Built with modern web technologies, it provides an intuitive interface for designing room layouts with advanced features including doors, windows, material calculations, and collaborative design tools.

## Core Architecture

### Frontend Technologies
- **React 18** with TypeScript for type-safe component development
- **Wouter** for lightweight client-side routing
- **TanStack Query** for efficient server state management
- **Tailwind CSS** with shadcn/ui components for modern styling
- **Vite** for fast development and building

### Backend Technologies
- **Express.js** server with TypeScript
- **PostgreSQL** database with Drizzle ORM
- **RESTful API** architecture
- **Session-based** data persistence

## Application Features

### 1. Canvas Drawing System

#### Room Creation Tool
- **Behavior**: Click and drag to create rectangular rooms
- **Interaction**: 
  - Start drag at desired corner position
  - Drag to opposite corner to define room dimensions
  - Release to finalize room placement
- **Visual Feedback**: Real-time preview while dragging
- **Keyboard Shortcut**: `R` key to activate room tool

#### Interactive Canvas
- **Pan and Zoom**: Mouse wheel zoom, click-drag pan navigation
- **Grid System**: Snap-to-grid functionality for precise alignment
- **Multi-selection**: Hold Shift to select multiple rooms
- **Responsive Design**: Adapts to different screen sizes

### 2. Room Management

#### Room Properties
- **Dimensions**: Adjustable width and height with real-time updates
- **Positioning**: Precise X/Y coordinate control
- **Naming**: Editable room labels with click-to-edit functionality
- **Color Coding**: Customizable room colors for visual organization
- **Area Calculation**: Automatic square footage calculation

#### Room Manipulation
- **Move Tool**: Select and drag rooms to new positions
- **Resize Handles**: Eight-point resize system (corners and edges)
- **Multi-room Operations**: Bulk operations on selected rooms
- **Keyboard Shortcut**: `M` key to activate move tool

### 3. Doors and Windows System

#### Door Placement
- **Wall Detection**: Intelligent wall detection for accurate placement
- **Door Styles**: 
  - Single doors
  - Double doors
  - Sliding doors
  - Bifold doors
- **Swing Properties**:
  - Direction: Inward/Outward
  - Side: Left/Right swing
- **Visual Representation**: Accurate door swing arcs and opening indicators
- **Keyboard Shortcut**: `D` key to activate door tool

#### Window Placement
- **Wall Positioning**: Click on any wall to place windows
- **Size Customization**: Adjustable window dimensions
- **Conflict Detection**: Prevents overlapping with doors or other windows
- **Visual Design**: Clean window representation with frame details
- **Keyboard Shortcut**: `W` key to activate window tool

#### Object Interaction
- **Drag and Drop**: Move doors and windows along walls
- **Property Panel**: Detailed property editing for selected objects
- **Deletion**: Delete key or property panel deletion
- **Validation**: Automatic conflict detection and resolution

### 4. Advanced Layout Tools

#### Auto-Alignment System
- **Edge Detection**: Automatically align rooms by their edges
- **Proximity Snapping**: Rooms snap together when moved close
- **Distribution Tools**:
  - Horizontal distribution for even spacing
  - Vertical distribution for organized layouts
- **Center Alignment**: Center rooms within the viewport

#### Room Transformation
- **Mirror Operations**: 
  - Horizontal mirroring
  - Vertical mirroring
- **Rotation**: (Future enhancement placeholder)
- **Scaling**: Proportional room scaling options

### 5. Material Calculation Panel

#### Automatic Calculations
- **Flooring Materials**: 
  - Total square footage across all rooms
  - Material estimates with waste factor
  - Cost calculations (when enabled)
- **Wall Materials**:
  - Perimeter calculations
  - Paint/wallpaper estimates
  - Trim and molding calculations
- **Door and Window Counts**: 
  - Complete inventory of openings
  - Hardware requirements

#### Material Types
- **Flooring Options**: Hardwood, tile, carpet, laminate calculations
- **Wall Finishes**: Paint, wallpaper, paneling estimates
- **Opening Materials**: Door and window frame calculations

### 6. Project Management

#### Save and Load System
- **Save Sketches**: Persistent storage of floor plans with custom names
- **Load Sketches**: Browse and load previously saved designs
- **Auto-save**: (Future enhancement)
- **Version Control**: (Future enhancement)

#### Sketch Organization
- **Naming Convention**: User-defined sketch names
- **Thumbnail Previews**: Visual previews of saved sketches
- **Date Tracking**: Creation and modification timestamps
- **Search and Filter**: (Future enhancement)

### 7. Preview Mode

#### Simplified View
- **Clean Layout**: Simplified room representation without tools
- **Print-Ready**: Optimized for printing and sharing
- **Scale Options**: Adjustable preview scaling
- **Export Options**: (Future enhancement for PDF/image export)

## User Interface Components

### 1. Application Header
- **Brand Identity**: Modern Floor Planner title
- **Primary Actions**:
  - New Sketch: Clear current work and start fresh
  - Save Sketch: Persist current design
  - Load Sketch: Access saved designs
  - Materials Toggle: Show/hide material calculations

### 2. Tool Sidebar
- **Collapsible Design**: Expandable tool categories
- **Organized Sections**:
  - Drawing Tools: Room creation and selection
  - Room Objects: Doors and windows
  - Room Alignment: Auto-alignment and distribution
  - Room Transform: Mirroring and positioning

### 3. Property Panel
- **Context-Sensitive**: Shows properties for selected elements
- **Room Properties**:
  - Dimensions (width, height)
  - Position (x, y coordinates)
  - Name and color
  - Area calculations
- **Object Properties**:
  - Door: Style, swing direction, swing side, dimensions
  - Window: Size and positioning

### 4. Canvas Controls
- **Zoom Controls**: Zoom in, zoom out, reset, fit to screen
- **Pan Mode Toggle**: Switch between selection and pan modes
- **View Options**: (Future enhancements for grid, guides, etc.)

## Technical Behaviors

### 1. Collision Detection
- **Room Overlap**: Visual indicators for overlapping rooms
- **Object Conflicts**: Prevention of door/window overlaps
- **Wall Boundaries**: Objects constrained to wall edges
- **Proximity Snapping**: Automatic alignment within tolerance

### 2. Data Persistence
- **Real-time Updates**: Immediate saving of changes to local state
- **Database Storage**: PostgreSQL backend for sketch persistence
- **JSON Structure**: Flexible room and object data modeling
- **Migration Support**: Schema evolution capabilities

### 3. Performance Optimization
- **Virtual Rendering**: Efficient canvas rendering for large floor plans
- **Debounced Updates**: Optimized property updates during drag operations
- **Memory Management**: Proper cleanup of event listeners and references
- **Responsive Updates**: Smooth real-time visual feedback

### 4. Error Handling
- **Validation**: Input validation for dimensions and properties
- **User Feedback**: Toast notifications for actions and errors
- **Graceful Degradation**: Fallback behaviors for edge cases
- **Recovery**: Auto-recovery from temporary issues

## Keyboard Shortcuts

### Primary Tools
- `R` - Activate Room drawing tool
- `M` - Activate Move/Select tool
- `D` - Activate Door placement tool
- `W` - Activate Window placement tool

### Object Manipulation
- `Delete` - Remove selected room or object
- `Escape` - Deselect all items
- `Shift + Click` - Multi-select rooms

### Navigation
- `Mouse Wheel` - Zoom in/out
- `Middle Mouse + Drag` - Pan canvas
- `Ctrl + 0` - Reset zoom to 100%
- `Ctrl + 1` - Fit to screen

## Design Patterns

### 1. Component Architecture
- **Separation of Concerns**: Distinct components for different functionalities
- **Props Interface**: Type-safe component communication
- **Event Handling**: Centralized event management system
- **State Management**: Hierarchical state with proper lifting

### 2. Data Flow
- **Unidirectional Flow**: Props down, events up pattern
- **Immutable Updates**: State updates using immutable patterns
- **Centralized State**: Main application state in FloorPlanner component
- **Derived State**: Calculated properties from base state

### 3. Responsive Design
- **Mobile Support**: Touch-friendly interactions
- **Tablet Optimization**: Optimized for tablet-based design work
- **Desktop Focus**: Full-featured desktop experience
- **Progressive Enhancement**: Core features work across all devices

## Future Enhancements

### Planned Features
- **Advanced Shapes**: Curved walls, irregular room shapes
- **Furniture Library**: Drag-and-drop furniture placement
- **Measurement Tools**: Distance and angle measurement tools
- **Layer System**: Separate layers for different design elements
- **Collaboration**: Real-time collaborative editing
- **Export Options**: PDF, DWG, and image export capabilities
- **Templates**: Pre-built room templates and layouts
- **3D Visualization**: Basic 3D preview mode

### Technical Improvements
- **Undo/Redo System**: Complete action history management
- **Auto-save**: Automatic periodic saving
- **Cloud Sync**: Cross-device synchronization
- **Performance**: WebGL rendering for complex floor plans
- **Accessibility**: Enhanced keyboard navigation and screen reader support

## Development Guidelines

### Code Organization
- **File Structure**: Logical organization by feature and component type
- **Naming Conventions**: Consistent PascalCase for components, camelCase for functions
- **Type Safety**: Comprehensive TypeScript coverage
- **Code Splitting**: Lazy loading for optimal performance

### Testing Strategy
- **Unit Tests**: Component and utility function testing
- **Integration Tests**: Feature workflow testing
- **E2E Tests**: Complete user journey testing
- **Visual Regression**: UI consistency validation

### Deployment
- **Build Process**: Optimized production builds
- **Environment Configuration**: Separate development and production settings
- **Database Migrations**: Automated schema updates
- **Monitoring**: Performance and error tracking

---

This documentation serves as a comprehensive guide to the Modern Floor Plan Application's features, behaviors, and technical implementation. It should be updated as new features are added or existing functionality is modified.