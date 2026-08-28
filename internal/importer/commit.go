package importer

import (
	"context"
	"fmt"
	"io"

	"github.com/klskk23/nexus-assets/internal/store"
)

// CommitResult is what a successful import produced.
type CommitResult struct {
	Created int    `json:"created"`
	BatchID string `json:"batch_id"`
	Report  Report `json:"report"`
}

// Commit writes the whole file, or none of it.
//
// All-or-nothing is not fussiness. A partially applied import leaves the
// operator unable to say which devices are in the system, and re-running the
// file then trips over the rows that did land. Every row also gets a create
// event sharing one batch id, so "which devices came in with that file" stays
// answerable afterwards.
func (s *Service) Commit(ctx context.Context, categoryID, actorID string, file io.Reader) (CommitResult, error) {
	rows, err := parse(file)
	if err != nil {
		return CommitResult{}, err
	}

	batchID := store.NewID()
	report, err := s.check(ctx, categoryID, actorID, rows, &batchID)
	if err != nil {
		return CommitResult{Report: report}, err
	}
	if report.Failed() {
		return CommitResult{Report: report}, fmt.Errorf("有 %d 行未通过校验，本次导入未写入任何数据",
			report.Total-report.OK)
	}
	return CommitResult{Created: report.OK, BatchID: batchID, Report: report}, nil
}
