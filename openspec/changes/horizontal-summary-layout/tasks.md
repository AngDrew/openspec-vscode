# Tasks: Horizontal Summary Layout Below Title

## 1. Update CSS Styles for Header Layout
**File:** `media/styles.css`
**Priority:** High
**Dependencies:** None

**Tasks:**
- [ ] Modify `.header` CSS to use `flex-direction: column` instead of current space-between layout
- [ ] Ensure `.header-title` maintains `display: flex` with `align-items: center` for title and badge
- [ ] Add `.summary` CSS to ensure horizontal display in single row using `flex` or fixed grid
- [ ] Remove responsive wrapping behavior that allows vertical stacking
- [ ] Update `.header` responsive styles (lines 356-368) to maintain column layout on mobile
- [ ] Test styling on various screen widths (768px, 1024px, 1200px+)

**Validation:**
- Header displays title/badge on top row
- Summary metrics display in single horizontal row below
- No vertical wrapping on any screen size
- Visual hierarchy is clear and well-spaced

## 2. Verify HTML Structure
**File:** `src/providers/webviewProvider.ts`
**Priority:** High
**Dependencies:** Task 1

**Tasks:**
- [ ] Review `getHtmlContent` method to confirm summary is within header section
- [ ] Verify HTML structure matches proposed layout
- [ ] Ensure `buildSummary` method returns correct div structure

**Validation:**
- Header contains both header-title and summary divs
- Nesting is correct for flex column layout

## 3. Test Layout in VS Code Extension
**Priority:** High
**Dependencies:** Tasks 1, 2

**Tasks:**
- [ ] Build extension (`npm run compile`)
- [ ] Package extension (`vsce package`)
- [ ] Install extension in VS Code
- [ ] Open OpenSpec detail view for an active change
- [ ] Take screenshot of new layout
- [ ] Verify all four summary items (Specs, Requirements, Active Changes, Completed) are visible in one row
- [ ] Test on different VS Code window widths
- [ ] Check dark and light themes

**Validation:**
- Summary metrics appear below title in all scenarios
- Layout is consistent across theme changes
- Extension builds and packages successfully

## 4. Documentation Update (Optional)
**Priority:** Low
**Dependencies:** Tasks 1-3

**Tasks:**
- [ ] Update CHANGELOG.md with layout change note
- [ ] Verify no breaking changes to extension API

## Success Criteria
✅ Summary section displays horizontally below title in all screen sizes
✅ Visual hierarchy is improved
✅ No regression in existing functionality
✅ Extension builds and runs successfully
✅ Layout works in both dark and light themes
