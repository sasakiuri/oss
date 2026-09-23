import { z } from 'zod';

/**
 * The areas the questions are grouped into, in the order a shooter meets them.
 *
 * The first six follow a hunter through the Wildlife Protection and Hunting Management Act:
 * what the law calls hunting, what it takes to be allowed to do it, where and when it may be
 * done, with what, the rules that exist to stop someone being shot, and what is owed afterwards.
 * The rest follow the gun itself through the statutes that govern it: holding one at all,
 * keeping it once held, where it may be fired, the powder and the cartridges it needs, and the
 * trade that makes and sells it.
 */
export const lawQuizCategories = [
  'basics',
  'licence',
  'areas',
  'methods',
  'safety',
  'duties',
  'possession',
  'keeping',
  'range',
  'powder',
  'ammunition',
  'manufacture',
] as const;
export const lawQuizCategorySchema = z.enum(lawQuizCategories);
export type LawQuizCategory = z.infer<typeof lawQuizCategorySchema>;

/**
 * The statute a group of categories is read from. Twelve areas is more than one list wants to
 * offer at once, and a reader who has just been sent to a range or to a gun shop wants the
 * questions for that statute rather than for one area of it.
 */
export const lawQuizFamilies = ['wildlife', 'firearms', 'explosives', 'arms'] as const;
export const lawQuizFamilySchema = z.enum(lawQuizFamilies);
export type LawQuizFamily = z.infer<typeof lawQuizFamilySchema>;

export const lawQuizCategoryFamily: Record<LawQuizCategory, LawQuizFamily> = {
  basics: 'wildlife',
  licence: 'wildlife',
  areas: 'wildlife',
  methods: 'wildlife',
  safety: 'wildlife',
  duties: 'wildlife',
  possession: 'firearms',
  keeping: 'firearms',
  range: 'firearms',
  powder: 'explosives',
  ammunition: 'explosives',
  manufacture: 'arms',
};

/**
 * The statutes the questions are read from. A question cites one of these and an article of it.
 * The two names ending in `Order` are Cabinet Office orders rather than enforcement orders of
 * their parent act: the designated ranges and the powder a shooter buys are governed by orders
 * of their own, and an article of either is the only place those rules are written down.
 */
export const lawKeySchema = z.enum([
  'act',
  'regulation',
  'gunAct',
  'gunOrder',
  'gunRegulation',
  'rangeOrder',
  'powderAct',
  'powderOrder',
  'powderRegulation',
  'huntingPowderOrder',
  'armsAct',
  'armsRegulation',
]);
export type LawKey = z.infer<typeof lawKeySchema>;

export const lawQuestionSourceSchema = z.object({
  law: lawKeySchema,
  // Down to the paragraph and item, so the sentence the answer rests on can be found.
  article: z.string().min(1),
});
export type LawQuestionSource = z.infer<typeof lawQuestionSourceSchema>;

export const lawQuestionSchema = z
  .object({
    id: z.string().min(1),
    category: lawQuizCategorySchema,
    question: z.string().min(1),
    choices: z.array(z.string().min(1)).length(4),
    answer: z.string().min(1),
    explanation: z.string().min(1),
    // At least one: a few answers rest on an article of the act and one of the regulation together.
    sources: z.array(lawQuestionSourceSchema).min(1),
  })
  .refine((question) => question.choices.includes(question.answer), {
    message: 'The answer has to be one of the choices',
  })
  .refine((question) => question.choices.filter((choice) => choice === question.answer).length === 1, {
    message: 'The answer has to appear among the choices exactly once',
  })
  .refine((question) => new Set(question.choices).size === question.choices.length, {
    message: 'The choices have to differ from one another',
  });
export type LawQuestion = z.infer<typeof lawQuestionSchema>;

/**
 * 'all' draws on every question, a statute narrows the pool to that statute, and a category
 * narrows it to one area within a statute. No family shares a name with a category, so a saved
 * scope reads back as the one thing it was written as.
 */
export const lawQuizScopeSchema = z.union([z.literal('all'), lawQuizFamilySchema, lawQuizCategorySchema]);
export type LawQuizScope = z.infer<typeof lawQuizScopeSchema>;

export const lawQuizOptionsSchema = z.object({
  scope: lawQuizScopeSchema.default('all'),
  // null asks for every question in the scope, which is why it is not simply a large number.
  questionCount: z.number().int().positive().nullable().default(null),
});
export type LawQuizOptions = z.infer<typeof lawQuizOptionsSchema>;

/**
 * A session as it is stored: the questions by id and the order their choices were shown in,
 * never the question text. Text that was saved once would go stale the moment an article is
 * amended and the question rewritten, and the reader would be answering a repealed rule.
 */
export const lawQuizSessionSchema = z
  .object({
    scope: lawQuizScopeSchema,
    prompts: z
      .array(
        z.object({
          id: z.string().min(1),
          // Read-only, like the choices a drawn prompt carries: a session is written once by the
          // draw and only read after that, and matching the two types keeps the drawn session
          // storable without a copy that exists solely to drop the modifier.
          choices: z.array(z.string().min(1)).length(4).readonly(),
        }),
      )
      .min(1),
    // One entry per question answered so far; null is a question that was skipped.
    answers: z.array(z.string().nullable()),
    /** Whether the answer to the current question has been revealed and its article shown. */
    revealed: z.boolean(),
  })
  .refine((session) => session.answers.length <= session.prompts.length, {
    message: 'A session cannot hold more answers than it has questions',
  })
  .refine((session) => new Set(session.prompts.map((prompt) => prompt.id)).size === session.prompts.length, {
    message: 'A session cannot ask the same question twice',
  });
export type LawQuizSession = z.infer<typeof lawQuizSessionSchema>;
