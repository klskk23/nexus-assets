package main

import (
	"context"
	"fmt"
	"log"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// runSeed fills a database with generated assets for performance work.
//
// Development only, and deliberately not shipped as demo data: the system
// starts empty on purpose, so that what an operator sees on a fresh install is
// their own configuration rather than someone else's fixtures.
func runSeed(ctx context.Context, a *app, count int) error {
	if count <= 0 {
		count = 10000
	}

	loc, err := a.holders.Create(ctx, holder.CreateInput{
		Type: model.EntityLocation, Name: "种子仓库",
	})
	if err != nil {
		return fmt.Errorf("create location: %w", err)
	}
	if err := a.holders.SetDefaultStock(ctx, loc.ID); err != nil {
		return err
	}

	root, err := a.schema.CreateCategory(ctx, schema.CreateCategoryInput{
		Code: "SEED", Name: "种子设备",
	})
	if err != nil {
		return fmt.Errorf("create category: %w", err)
	}
	child, err := a.schema.CreateCategory(ctx, schema.CreateCategoryInput{
		Code: "SEEDRT", Name: "种子路由器", ParentID: &root.ID,
	})
	if err != nil {
		return err
	}

	mac, err := a.schema.CreateField(ctx, schema.CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true,
	})
	if err != nil {
		return err
	}
	fw, err := a.schema.CreateField(ctx, schema.CreateFieldInput{
		Key: "firmware", Label: "固件版本", Type: model.FieldText,
	})
	if err != nil {
		return err
	}
	// The numbering rule is an ordinary expression key now: unique so it can
	// serve as the display key, and bound only after its input exists.
	sn, err := a.schema.CreateField(ctx, schema.CreateFieldInput{
		Key: "sn", Label: "设备编号", Type: model.FieldComputed, IsUnique: true,
		Options: model.FieldOptions{Template: "{{ .attrs.mac | hex2dec }}"},
	})
	if err != nil {
		return err
	}
	if err := a.schema.Bind(ctx, root.ID, mac.ID, true, 10); err != nil {
		return err
	}
	if err := a.schema.Bind(ctx, root.ID, fw.ID, false, 20); err != nil {
		return err
	}
	if err := a.schema.Bind(ctx, root.ID, sn.ID, false, 30); err != nil {
		return err
	}
	displayKey := "sn"
	if _, err := a.schema.UpdateCategory(ctx, root.ID, schema.UpdateCategoryInput{
		DisplayKey: &displayKey,
	}); err != nil {
		return err
	}

	owner, err := ownerID(ctx, a)
	if err != nil {
		return err
	}

	statuses := []model.AssetStatus{
		model.StatusInStock, model.StatusInStock, model.StatusInStock,
		model.StatusInUse, model.StatusInRepair,
	}
	firmwares := []string{"2.1.3", "2.2.0", "2.2.1"}

	for i := 0; i < count; i++ {
		category := root.ID
		if i%3 == 0 {
			category = child.ID
		}
		status := statuses[i%len(statuses)]
		h := model.Holder{Type: model.HolderTypeEntity, ID: loc.ID}
		if status == model.StatusInUse {
			h = model.Holder{Type: model.HolderTypeUser, ID: owner}
		}

		if _, err := a.assets.Save(ctx, asset.SaveInput{
			CategoryID: category,
			Status:     status,
			OwnerID:    owner,
			Holder:     h,
			ActorID:    owner,
			Attrs: map[string]any{
				"mac":      fmt.Sprintf("02%010X", i),
				"firmware": firmwares[i%len(firmwares)],
			},
		}); err != nil {
			return fmt.Errorf("seed asset %d: %w", i, err)
		}
		if (i+1)%1000 == 0 {
			log.Printf("seeded %d/%d", i+1, count)
		}
	}
	log.Printf("seeded %d assets", count)
	return nil
}

func ownerID(ctx context.Context, a *app) (string, error) {
	users, err := a.users.List(ctx)
	if err != nil {
		return "", err
	}
	if len(users) == 0 {
		u, err := a.users.Create(ctx, auth.CreateInput{
			Email: "seed@example.com", Name: "种子账号",
			AuthType: model.AuthLocal, Password: "seed-only-password",
		})
		if err != nil {
			return "", err
		}
		return u.ID, nil
	}
	return users[0].ID, nil
}
