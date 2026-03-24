# Category Criteria Display Implementation Plan

## Overview

Display Merit (+), Demerit (-), and CAS Alignment information when a category is selected in the evaluation form.

## Schema Changes

### point_categories table (schema.ts)

Add three new fields:

- `meritCriteria`: string[] - List of positive behavior indicators
- `demeritCriteria`: string[] - List of negative behavior indicators
- `casAlignment`: string - CAS framework alignment (Service, Creativity, Activity, etc.)

## Data Mapping (from your image)

| Category       | CAS Alignment         | Merit Criteria                                                                                                                          | Demerit Criteria                                                                                                                            |
| -------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Service               | • Takes responsibility for actions and commitments<br>• Follows school rules and procedures<br>• Corrects mistakes independently        | • Repeated rule violations<br>• Avoids responsibility or shifts blame<br>• Neglects assigned duties                                         |
| Excellence     | Creativity / Activity | • Exceeds expected standards<br>• Demonstrates initiative or leadership<br>• Produces high-quality work or performance                  | • Careless or low-effort work<br>• Does not meet expected standards<br>• Repeated lack of quality or commitment                             |
| Service        | Service               | • Voluntarily helps peers or staff<br>• Contributes positively to the school community<br>• Participates actively in service activities | • Refuses to support expected service tasks<br>• Disrupts or undermines service activities<br>• Shows disrespect during service involvement |
| Persistence    | Activity / Creativity | • Perseveres through challenges<br>• Completes tasks despite difficulty<br>• Demonstrates resilience and effort                         | • Gives up easily<br>• Avoids challenges<br>• Leaves tasks unfinished without valid reason                                                  |
| Enthusiasm     | Creativity / Activity | • Actively engages in learning or activities<br>• Shows positive attitude and motivation<br>• Encourages peers through participation    | • Displays negative or disengaged attitude<br>• Refuses to participate<br>• Consistently disengaged                                         |
| Collaboration  | Service / Creativity  | • Works respectfully in teams<br>• Communicates effectively<br>• Contributes fairly to group work                                       | • Disrupts group work<br>• Refuses to cooperate<br>• Excludes or dominates others                                                           |
| Timeliness     | Service               | • Punctual and prepared<br>• Meets deadlines consistently<br>• Manages time responsibly                                                 | • Repeated lateness<br>• Missed deadlines without valid reason<br>• Unprepared for class or activities                                      |

## UI Component: CategoryInfoCard

```svelte
<!-- CategoryInfoCard.svelte -->
<Card.Root class="mt-4">
	<Card.Header class="pb-2">
		<div class="flex items-center justify-between">
			<Card.Title>{category.name}</Card.Title>
			<Badge variant="outline">{category.casAlignment}</Badge>
		</div>
	</Card.Header>
	<Card.Content>
		<div class="grid grid-cols-2 gap-4">
			<!-- Merit Column -->
			<div class="space-y-2">
				<h4 class="flex items-center gap-1 text-sm font-semibold text-emerald-600">
					<Plus class="size-4" />
					Merit (+)
				</h4>
				<ul class="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
					{#each category.meritCriteria as criterion}
						<li>{criterion}</li>
					{/each}
				</ul>
			</div>

			<!-- Demerit Column -->
			<div class="space-y-2">
				<h4 class="flex items-center gap-1 text-sm font-semibold text-red-600">
					<Minus class="size-4" />
					Demerit (-)
				</h4>
				<ul class="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
					{#each category.demeritCriteria as criterion}
						<li>{criterion}</li>
					{/each}
				</ul>
			</div>
		</div>
	</Card.Content>
</Card.Root>
```

## Integration in Evaluation Form

Add the CategoryInfoCard below the Select component in `+page.svelte`:

```svelte
<!-- Category selection with info card -->
<div class="mb-5">
	<label class="mb-2 block text-sm font-medium">
		Category
		<Select.Root type="single" bind:value={categoryId}>
			<Select.Trigger class="mt-1" aria-label="Select category">
				{selectedCategory?.name || 'Select Category'}
			</Select.Trigger>
			<Select.Content>
				{#each categoriesQuery.data || [] as cat (cat._id)}
					<Select.Item value={cat._id}>{cat.name}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</label>

	<!-- Show criteria when category selected -->
	{#if selectedCategory?.meritCriteria}
		<CategoryInfoCard category={selectedCategory} />
	{/if}
</div>
```

## Benefits

1. **Clear Guidance**: Teachers see exactly what behaviors to evaluate
2. **CAS Context**: Helps teachers understand the IB CAS alignment
3. **Consistent Standards**: All teachers use the same criteria
4. **Non-intrusive**: Card appears below select, doesn't block interaction
5. **Rich Formatting**: Full lists with proper bullet points and colors

## Files to Modify

1. `src/convex/schema.ts` - Add new fields
2. `src/convex/categories.ts` - Update queries and seed data
3. `src/lib/components/CategoryInfoCard.svelte` - Create new component
4. `src/routes/evaluations/new/+page.svelte` - Add info card to form
