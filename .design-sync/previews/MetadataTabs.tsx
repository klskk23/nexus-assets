import { MetadataTabs } from "nexus-assets-web"

/**
 * Two pairs of metadata pages that are really one subject each: models live
 * with their vendors, fields with their groups. The tabs keep them one place
 * to look rather than four entries competing in the navigation rail.
 *
 * These are router links, not local state -- each tab is its own address, so a
 * filtered vendor list survives being linked to.
 */
export const Fields = () => <MetadataTabs current="fields" />
export const Groups = () => <MetadataTabs current="groups" />
export const Models = () => <MetadataTabs current="models" />
export const Vendors = () => <MetadataTabs current="vendors" />
