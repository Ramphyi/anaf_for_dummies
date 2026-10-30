import { z } from "zod";
import { VAT_CATEGORIES } from "@/lib/db/schema";
import { zDate, zOptText } from "@/lib/server/action";

export const zOptDate = z.union([zDate, z.literal(""), z.null(), z.undefined()]).transform((v) => v || null);
export const zOptId = z.union([z.string(), z.null(), z.undefined()]).transform((v) => v || null);

export const lineSchema = z.object({
  productId: zOptId,
  name: z.string().trim().min(1, "Completează denumirea fiecărei linii"),
  description: zOptText,
  unit: z.string().trim().min(1, "Unitatea de măsură este obligatorie"),
  quantity: z
    .number({ error: "Cantitate invalidă" })
    .finite()
    .refine((v) => v !== 0, "Cantitatea nu poate fi 0"),
  unitPrice: z.number({ error: "Preț invalid" }).finite(),
  discountPercent: z.number().min(0, "Discount invalid").max(100, "Discountul nu poate depăși 100%").default(0),
  vatRate: z.number().min(0).max(100),
  vatCategory: z.enum(VAT_CATEGORIES),
});
