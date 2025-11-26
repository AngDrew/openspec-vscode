# Change Proposal: Horizontal Summary Layout Below Title

## Why
The user requested to update the layout of detail.specs, requirements, active changes, completed from vertical to horizontal below the title. Currently, the summary metrics appear beside the title in the header, but the user prefers them stacked vertically below the title with a clear visual hierarchy. This change improves readability and provides better space utilization for the detail view content.

## Summary
Update the detail view layout to display the summary metrics (Specs, Requirements, Active Changes, Completed) horizontally in a single row below the title, rather than beside it or in a wrapped grid layout.

## Motivation
The current layout positions the summary metrics horizontally beside the title within the header. While functional, users prefer to have the title and status badge as a complete header unit, with the summary metrics displayed below as a dedicated section. This improves visual hierarchy and provides better space utilization for the detail view content.

## Current State
The summary section is rendered within the header using CSS Grid:
- Positioned horizontally beside the title and status badge
- Uses `grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))`
- May wrap to multiple rows on smaller screens
- Structure: `<header><title + badge><summary></header>`

## Proposed Changes

### HTML Structure Changes
Move the summary section from beside the title to below the title within the header:

**Before:**
```html
<header class="header">
  <div class="header-title">
    <h1>Title</h1>
    <span class="badge">Status</span>
  </div>
  <div class="summary">...</div>
</header>
```

**After:**
```html
<header class="header">
  <div class="header-title">
    <h1>Title</h1>
    <span class="badge">Status</span>
  </div>
  <div class="summary">...</div>
</header>
```

### CSS Layout Changes
1. Update `.header` to use flex column direction instead of space-between
2. Update `.summary` to display as a fixed horizontal row without wrapping
3. Ensure responsive behavior is maintained for smaller screens

## Files to Modify
1. `src/providers/webviewProvider.ts` - buildSummary method (HTML structure)
2. `media/styles.css` - .header and .summary styles

## Testing
- Verify summary displays horizontally below title
- Verify on different screen sizes
- Verify no wrap occurs to vertical layout
- Check visual hierarchy and spacing
