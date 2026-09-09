package transfer

import (
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// Whole-system movements, and the filters people actually reach for.
//
// The number filter is the one worth testing hardest: the number is not a
// column, so the tempting implementation loads everything, resolves the number
// in Go and filters there -- which cannot paginate, because LIMIT would have
// applied before the filter and the total would be a lie. These tests pin the
// behaviour that rules that implementation out: a filtered total, and a page
// boundary that lands where the filter says it should.
func TestListFiltersAndPages(t *testing.T) {
	f := newFixture(t)
	f.setDefaultStock(t)
	ids := f.newAsset(t, 6)

	// Two actors, so "who did this" has something to separate.
	for i, id := range ids {
		actor := f.userID
		if i%2 == 1 {
			actor = f.otherID
		}
		if _, err := f.svc.Apply(f.ctx, Request{
			AssetIDs: []string{id}, ActorID: actor,
			ToStatus: status(model.StatusInUse),
			ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: actor},
		}); err != nil {
			t.Fatalf("record %d: %v", i, err)
		}
	}

	all, err := f.svc.List(f.ctx, ListFilter{Limit: 100})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	// Six creations plus six check-outs.
	if all.Total != 12 {
		t.Fatalf("total = %d, want 12", all.Total)
	}

	// Newest first. Anything else and "what just happened" needs paging to the
	// end, which is the opposite of what a log is for.
	for i := 1; i < len(all.Items); i++ {
		if all.Items[i].CreatedAt.After(all.Items[i-1].CreatedAt) {
			t.Fatalf("item %d is newer than the one before it", i)
		}
	}

	byActor, err := f.svc.List(f.ctx, ListFilter{ActorID: f.otherID, Limit: 100})
	if err != nil {
		t.Fatalf("by actor: %v", err)
	}
	if byActor.Total == 0 || byActor.Total >= all.Total {
		t.Errorf("actor filter did nothing: %d of %d", byActor.Total, all.Total)
	}
	for _, it := range byActor.Items {
		if it.ActorID != f.otherID {
			t.Errorf("actor filter leaked %s", it.ActorID)
		}
	}

	byKind, err := f.svc.List(f.ctx, ListFilter{Kind: string(model.KindCheckout), Limit: 100})
	if err != nil {
		t.Fatalf("by kind: %v", err)
	}
	if byKind.Total != 6 {
		t.Errorf("check-outs = %d, want 6", byKind.Total)
	}

	// Two filters at once. Somebody asking "what did they check out" is asking
	// both questions, and answering one of them is worse than answering neither.
	both, err := f.svc.List(f.ctx, ListFilter{
		ActorID: f.otherID, Kind: string(model.KindCheckout), Limit: 100,
	})
	if err != nil {
		t.Fatalf("combined: %v", err)
	}
	if both.Total != 3 {
		t.Errorf("combined = %d, want 3", both.Total)
	}

	// Nothing matches: an empty page, not an error and not everything.
	none, err := f.svc.List(f.ctx, ListFilter{ActorID: "nobody", Limit: 100})
	if err != nil {
		t.Fatalf("empty: %v", err)
	}
	if none.Total != 0 || len(none.Items) != 0 {
		t.Errorf("empty filter returned %d/%d", none.Total, len(none.Items))
	}

	// Paging: the total is of the whole filtered set, not of the page, and the
	// second page continues where the first stopped rather than repeating it.
	first, err := f.svc.List(f.ctx, ListFilter{Limit: 5})
	if err != nil {
		t.Fatalf("page 1: %v", err)
	}
	second, err := f.svc.List(f.ctx, ListFilter{Limit: 5, Offset: 5})
	if err != nil {
		t.Fatalf("page 2: %v", err)
	}
	if first.Total != 12 || second.Total != 12 {
		t.Errorf("totals move with the page: %d, %d", first.Total, second.Total)
	}
	if len(first.Items) != 5 || len(second.Items) != 5 {
		t.Fatalf("page sizes %d, %d", len(first.Items), len(second.Items))
	}
	seen := map[string]bool{}
	for _, it := range append(append([]model.Transfer{}, first.Items...), second.Items...) {
		if seen[it.ID] {
			t.Errorf("%s appears on both pages", it.ID)
		}
		seen[it.ID] = true
	}
}

// The number is read off a label and typed by hand, so a filter that demands
// the whole of it, in the right case, is a filter nobody can use.
func TestListFiltersByAssetNumberLoosely(t *testing.T) {
	f := newFixture(t)
	f.setDefaultStock(t)
	ids := f.newAsset(t, 3)

	numbers, err := f.assets.DisplayNames(f.ctx, ids)
	if err != nil {
		t.Fatalf("display names: %v", err)
	}
	target := numbers[ids[0]]
	if len(target) < 4 {
		t.Fatalf("number %q too short to take a middle from", target)
	}
	middle := target[1 : len(target)-1]

	for _, probe := range []struct {
		name, q string
	}{
		{"whole", target},
		{"middle fragment", middle},
		{"upper case", strings.ToUpper(middle)},
		{"lower case", strings.ToLower(middle)},
	} {
		got, err := f.svc.List(f.ctx, ListFilter{AssetNumber: probe.q, Limit: 100})
		if err != nil {
			t.Fatalf("%s: %v", probe.name, err)
		}
		if got.Total == 0 {
			t.Errorf("%s (%q) matched nothing", probe.name, probe.q)
			continue
		}
		for _, it := range got.Items {
			if it.AssetID != ids[0] {
				t.Errorf("%s leaked a movement of another asset", probe.name)
			}
		}
	}

	// And it still narrows: a number nobody has matches nothing.
	got, err := f.svc.List(f.ctx, ListFilter{AssetNumber: "zzzz-no-such", Limit: 100})
	if err != nil {
		t.Fatalf("no match: %v", err)
	}
	if got.Total != 0 {
		t.Errorf("nonsense number matched %d", got.Total)
	}
}
