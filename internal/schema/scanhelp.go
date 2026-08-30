package schema

import (
	"encoding/json"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

func decodeOptions(raw string, into *model.FieldOptions) error {
	if raw == "" {
		return nil
	}
	if err := json.Unmarshal([]byte(raw), into); err != nil {
		return fmt.Errorf("decode field options: %w", err)
	}
	return nil
}

func fillTimes(f *model.FieldDefinition, created, updated string) error {
	var err error
	if f.CreatedAt, err = store.ParseTime(created); err != nil {
		return err
	}
	if f.UpdatedAt, err = store.ParseTime(updated); err != nil {
		return err
	}
	return nil
}
