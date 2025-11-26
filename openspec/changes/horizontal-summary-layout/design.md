# Design Document: Horizontal Summary Layout

## Overview
This document outlines the design decisions for reorganizing the summary metrics layout in the OpenSpec VS Code extension detail view from a horizontal side-by-side layout to a vertical stacked layout with summary below the title.

## Problem Statement
The current implementation places the summary metrics (Specs, Requirements, Active Changes, Completed) beside the title and status badge in the header. This creates:
- Less clear visual hierarchy
- Potential space constraints for long titles
- Summary metrics compete with title for attention

## Solution Design

### Layout Structure

#### Current Layout
```
┌─────────────────────────────────────────────────┐
│ [Title + Badge]              [Summary Metrics]  │
│                                                    │
│ Content sections below                           │
└─────────────────────────────────────────────────┘
```

#### Proposed Layout
```
┌─────────────────────────────────────────────────┐
│ Title + Badge                                      │
│ ────────────────────────────────────             │
│ [Specs] [Req] [Active] [Completed]               │
│                                                    │
│ Content sections below                           │
└─────────────────────────────────────────────────┘
```

### CSS Approach

#### Header Container (.header)
```css
.header {
  /* Change from space-between to column */
  display: flex;
  flex-direction: column;
  gap: 16px; /* Add spacing between title and summary */
}
```

**Rationale:**
- `flex-direction: column` ensures vertical stacking
- Gap property provides consistent spacing
- Maintains flexbox for easy alignment

#### Summary Container (.summary)
```css
.summary {
  /* Force single row layout */
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
}

.summary-item {
  /* Ensure equal width distribution */
  flex: 1;
  min-width: 0; /* Prevent overflow */
}
```

**Rationale:**
- `flex-wrap: nowrap` prevents vertical wrapping
- Equal flex distribution for consistent widths
- Min-width: 0 prevents text overflow issues

#### Responsive Behavior
```css
@media (max-width: 768px) {
  .header {
    /* Maintain column layout on mobile */
    flex-direction: column;
  }
  
  .summary {
    /* Keep horizontal on mobile - may need scrolling */
    flex-wrap: nowrap;
    overflow-x: auto; /* Add horizontal scroll if needed */
  }
}
```

**Rationale:**
- Preserve horizontal layout across all screen sizes
- Add horizontal scroll for narrow screens if needed
- Maintain consistent behavior

## Alternative Considered

### Option 2: Keep Grid, Adjust Structure
Keep CSS Grid but restructure HTML to move summary outside header into content area.

**Pros:**
- Less CSS modification needed
- Grid auto-wrapping handles narrow screens

**Cons:**
- Summary visually separated from title
- Requires HTML restructuring in multiple places
- Less semantic alignment with title

**Decision:** Rejected in favor of proposed solution for better visual hierarchy.

## Implementation Plan

### Phase 1: CSS Modifications
1. Update `.header` flex-direction to column
2. Update `.summary` to use flex with nowrap
3. Test on multiple screen sizes

### Phase 2: Validation
1. Build and test extension
2. Verify layout in both themes
3. Check responsive behavior

### Phase 3: Polish
1. Adjust spacing if needed
2. Add horizontal scroll for very narrow screens (if required)
3. Update CHANGELOG

## Testing Strategy

### Visual Testing
- Verify title, badge, and summary alignment
- Check spacing consistency
- Ensure no overlap on any screen width

### Functional Testing
- All existing features remain unchanged
- Summary counts update correctly
- Collapsible sections still work

### Cross-Theme Testing
- Light theme: VS Code Light
- Dark theme: VS Code Dark
- High Contrast theme (if applicable)

## Risks and Mitigations

### Risk: Summary items may overflow on narrow screens
**Mitigation:** Add `overflow-x: auto` to `.summary` for horizontal scrolling

### Risk: Visual hierarchy may feel disconnected
**Mitigation:** Add border divider between title and summary

### Risk: Performance impact from layout change
**Mitigation:** Minimal CSS changes, no JavaScript modifications required

## Success Metrics
- Summary displays in single horizontal row on all screen sizes ≥768px
- Visual hierarchy is improved (title → summary → content)
- No horizontal scrolling needed on screens ≥1024px
- Layout maintains consistency across themes
- Zero regression in existing functionality
