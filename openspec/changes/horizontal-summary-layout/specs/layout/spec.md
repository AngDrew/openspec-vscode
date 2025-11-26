# Specification: Horizontal Summary Layout

## ADDED Requirements

### Requirement: Summary Position Below Title
The summary section containing Specs, Requirements, Active Changes, and Completed metrics MUST be positioned below the title and status badge in the detail view header.

**Rationale:** Improves visual hierarchy by creating a clear separation between the title and its supporting metrics.

**Acceptance Criteria:**
- [ ] Summary appears after title/badge in DOM order
- [ ] Summary is vertically aligned below title
- [ ] No summary content appears beside title

**Implementation Notes:**
- Modify `getHtmlContent` method in `webviewProvider.ts`
- Ensure summary HTML is rendered within header but after header-title div

#### Scenario: Basic Layout
Given a change detail view is displayed
When the page loads
Then the title appears first
Followed by the summary section below it
With no summary content beside the title

### Requirement: Horizontal Single-Row Layout
The four summary items (Specs, Requirements, Active Changes, Completed) MUST display in a single horizontal row without vertical wrapping.

**Rationale:** User specifically requested horizontal layout below the title for better visibility and consistency.

**Acceptance Criteria:**
- [ ] All four items visible in one row on screens ≥1024px width
- [ ] No vertical stacking occurs on any screen size ≥768px
- [ ] Items maintain equal or proportional widths
- [ ] Horizontal spacing is consistent between items

**Responsive Behavior:**
- On screens <768px, horizontal scrolling may occur but no vertical wrap

#### Scenario: Four Items in Row
Given four summary metrics (Specs, Requirements, Active Changes, Completed)
When displayed on a 1200px wide screen
Then all four items appear in one horizontal row
And no vertical wrapping occurs
And each item has equal width distribution

### Requirement: CSS Flex Layout
The summary section MUST use CSS Flexbox with `flex-wrap: nowrap` to enforce single-row layout.

**Rationale:** Flexbox provides better control over item distribution and prevents unwanted wrapping compared to CSS Grid.

**Acceptance Criteria:**
- [ ] `.summary` container uses `display: flex`
- [ ] `.summary` has `flex-wrap: nowrap` property
- [ ] Summary items use `flex: 1` for equal distribution
- [ ] No grid-related properties used for summary layout

**Implementation Notes:**
- Update `.summary` class in `media/styles.css`
- Remove or override existing grid properties

#### Scenario: Flex Container Validation
Given the summary section is rendered
When inspecting computed CSS styles
Then the display property is "flex"
And flex-wrap is "nowrap"
And summary items maintain their horizontal position

### Requirement: Header Flex Column Layout
The header container MUST use `flex-direction: column` to stack title and summary vertically.

**Rationale:** Maintains semantic grouping while ensuring proper vertical alignment.

**Acceptance Criteria:**
- [ ] `.header` uses `display: flex` with `flex-direction: column`
- [ ] `gap: 16px` provides consistent spacing
- [ ] Title and summary are properly aligned to the left

**Implementation Notes:**
- Modify `.header` class in `media/styles.css`
- Replace existing `justify-content: space-between` with column layout

#### Scenario: Vertical Stacking
Given the header contains title and summary
When the page renders
Then title and summary are vertically stacked
With consistent gap spacing between them
And both align to the left edge

### Requirement: Visual Hierarchy with Divider
A visual divider MUST separate the title section from the summary section.

**Rationale:** Provides clear visual separation and improves readability.

**Acceptance Criteria:**
- [ ] Divider line appears between title and summary
- [ ] Divider uses `--vscode-border` color for consistency
- [ ] Divider has appropriate margin (top: 8px, bottom: 12px)

**Implementation Notes:**
- Add border-top to `.header-title` or margin to `.summary`
- Use VS Code theme variables for consistency

#### Scenario: Large Title Text
Given a change with a very long title
When the detail view is displayed
Then the summary appears below the title in a single row
And the summary does not wrap vertically even if title wraps

#### Scenario: Narrow Window
Given a VS Code window narrowed to 800px width
When the detail view is displayed
Then the summary items remain in one horizontal row
And horizontal scrolling may occur if needed

#### Scenario: Multiple Digit Counts
Given summary metrics with high counts (e.g., 9999 requirements)
When displayed
Then all items fit in single row without truncation
And numbers are fully visible

#### Scenario: Both Themes
Given detail view in VS Code light theme
And detail view in VS Code dark theme
Then the layout is identical
And only colors adapt to theme

#### Scenario: Initial Load
Given a change is selected from explorer
When the detail view opens
Then the title appears first
Then the summary appears directly below
All in correct vertical order

## MODIFIED Requirements

### Requirement: Responsive Breakpoint Behavior
The summary MUST maintain horizontal layout on all screens ≥768px.

**Change Summary:**
Previously: Summary could wrap to multiple rows on narrow screens
Now: The summary maintains horizontal layout on all screens, with horizontal scrolling allowed if needed.

**Rationale:** User preference for consistent horizontal presentation

**Changes:**
- Remove or override responsive grid behavior
- Add horizontal scrolling instead of vertical wrapping
- Maintain consistent layout across all screen sizes

**Acceptance Criteria:**
- [ ] No vertical wrapping occurs at any breakpoint
- [ ] Horizontal scroll available if content exceeds width
- [ ] Layout behavior documented in responsive styles

#### Scenario: 768px Breakpoint
Given a browser window resized to exactly 768px width
When the detail view is displayed
Then the summary remains in a single horizontal row
And no vertical wrapping occurs
And items may shrink but remain visible

## REMOVED Requirements

### Requirement: Auto-fit Grid Layout
The `grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))` layout is REMOVED for the summary section.

**Rationale:** Replaced with flexbox for more predictable single-row behavior

**Impact:**
- Summary no longer adapts column count based on available width
- Always displays exactly 4 columns (or flexible items if modified)
- More consistent with user request for horizontal layout

## Files Modified

### src/providers/webviewProvider.ts
- No changes required to HTML structure - summary already in header
- Review `getHtmlContent` method for confirmation

### media/styles.css
- Modify `.header` class: `flex-direction: column`
- Modify `.summary` class: `display: flex`, `flex-wrap: nowrap`
- Update responsive media queries
- Add visual divider between sections

## Validation Tests

### Test 1: Layout Structure
```typescript
// Pseudo-test for DOM structure
const header = document.querySelector('.header');
const titleSection = header.querySelector('.header-title');
const summarySection = header.querySelector('.summary');

assert(titleSection.compareDocumentPosition(summarySection) & Node.DOCUMENT_POSITION_FOLLOWING);
```

### Test 2: Horizontal Display
```typescript
const summaryItems = document.querySelectorAll('.summary-item');
const firstItem = summaryItems[0];
const lastItem = summaryItems[summaryItems.length - 1];

// Both items should have same top position (no vertical offset)
assert(firstItem.offsetTop === lastItem.offsetTop);
```

### Test 3: No Wrapping
```typescript
const summary = document.querySelector('.summary');
const computedStyle = window.getComputedStyle(summary);

assert(computedStyle.flexWrap === 'nowrap');
```

## Dependencies
- None - purely CSS/HTML layout change
- No changes to JavaScript logic required
- No API modifications

## Backward Compatibility
This change modifies visual presentation only:
- No breaking changes to extension API
- No changes to data structures
- No changes to functionality
- Users will see improved layout without code changes
