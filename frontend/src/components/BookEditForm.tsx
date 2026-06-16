import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MenuItem } from '@blueprintjs/core'
import { MultiSelect, Suggest } from '@blueprintjs/select'
import { Book, metadata } from '../types'
import { UpdateBook, GetAllAuthors, GetAllTags, GetAllSeries } from '../../wailsjs/go/main/App'

const schema = z.object({
  Title: z.string().min(1, 'Title is required'),
  Authors: z.array(z.string()),
  Publisher: z.string(),
  Series: z.string(),
  SeriesIndex: z.coerce.number().min(0),
  Language: z.string(),
  Description: z.string(),
  Tags: z.array(z.string()),
  Rating: z.coerce.number().min(0).max(5).int(),
  DatePublished: z.string(),
  IsRead: z.boolean(),
})

type FormValues = z.infer<typeof schema>

function toFormValues(book: Book): FormValues {
  return {
    Title: book.Title,
    Authors: book.Authors ?? [],
    Publisher: book.Publisher,
    Series: book.Series,
    SeriesIndex: book.SeriesIndex,
    Language: book.Language,
    Description: book.Description,
    Tags: book.Tags ?? [],
    Rating: book.Rating,
    DatePublished: book.DatePublished.slice(0, 10),
    IsRead: book.IsRead,
  }
}

function toBook(values: FormValues, originalBook: Book): Book {
  return new metadata.Book({
    ID: originalBook.ID,
    Title: values.Title,
    Authors: values.Authors.filter(Boolean),
    Publisher: values.Publisher,
    Series: values.Series,
    SeriesIndex: values.SeriesIndex,
    Language: values.Language,
    Description: values.Description,
    Tags: values.Tags.filter(Boolean),
    Rating: values.Rating,
    DatePublished: values.DatePublished,
    DateAdded: originalBook.DateAdded,
    CoverPath: originalBook.CoverPath,
    Formats: originalBook.Formats,
    CoverData: originalBook.CoverData,
    IsRead: values.IsRead,
  })
}

interface Props {
  book: Book
  onClose: () => void
  onSave: (updated: Book) => void
}

function filterItem(query: string, item: string): boolean {
  return item.toLowerCase().includes(query.toLowerCase())
}

export function BookEditForm({ book, onClose, onSave }: Props) {
  const [allAuthors, setAllAuthors] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [allSeries, setAllSeries] = useState<string[]>([])

  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: toFormValues(book),
  })

  useEffect(() => {
    reset(toFormValues(book))
  }, [book, reset])

  useEffect(() => {
    Promise.all([GetAllAuthors(), GetAllTags(), GetAllSeries()]).then(([authors, tags, series]) => {
      setAllAuthors(authors ?? [])
      setAllTags(tags ?? [])
      setAllSeries(series ?? [])
    })
  }, [])

  async function onSubmit(values: FormValues) {
    try {
      const updated = toBook(values, book)
      await UpdateBook(updated)
      onSave(updated)
      onClose()
    } catch (err) {
      console.error('Failed to update book:', err)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Title</label>
        <Controller
          control={control}
          name="Title"
          render={({ field }) => (
            <input
              {...field}
              type="text"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Book title"
            />
          )}
        />
        {errors.Title && <p className="text-red-500 text-xs mt-1">{errors.Title.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Authors</label>
        <Controller
          control={control}
          name="Authors"
          render={({ field }) => (
            <MultiSelect<string>
              items={allAuthors}
              selectedItems={field.value}
              onItemSelect={(item) => {
                if (!field.value.includes(item)) {
                  field.onChange([...field.value, item])
                }
              }}
              onRemove={(item) => field.onChange(field.value.filter(a => a !== item))}
              tagRenderer={(item) => item}
              itemRenderer={(item, { handleClick, handleFocus, modifiers }) => {
                if (!modifiers.matchesPredicate) return null
                return (
                  <MenuItem
                    key={item}
                    text={item}
                    onClick={handleClick}
                    onFocus={handleFocus}
                    active={modifiers.active}
                    disabled={modifiers.disabled}
                    selected={field.value.includes(item)}
                    roleStructure="listoption"
                  />
                )
              }}
              itemPredicate={filterItem}
              createNewItemFromQuery={(q) => q}
              createNewItemRenderer={(query, active, handleClick) => (
                <MenuItem
                  key="create"
                  icon="add"
                  text={`Add "${query}"`}
                  active={active}
                  onClick={handleClick}
                  roleStructure="listoption"
                />
              )}
              noResults={<MenuItem disabled text="No results" roleStructure="listoption" />}
              placeholder="Add author…"
            />
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Series</label>
          <Controller
            control={control}
            name="Series"
            render={({ field }) => (
              <Suggest<string>
                items={allSeries}
                selectedItem={null}
                query={field.value}
                onQueryChange={(q) => field.onChange(q)}
                onItemSelect={(item) => field.onChange(item)}
                inputValueRenderer={(item) => item}
                itemRenderer={(item, { handleClick, handleFocus, modifiers }) => {
                  if (!modifiers.matchesPredicate) return null
                  return (
                    <MenuItem
                      key={item}
                      text={item}
                      onClick={handleClick}
                      onFocus={handleFocus}
                      active={modifiers.active}
                      disabled={modifiers.disabled}
                      roleStructure="listoption"
                    />
                  )
                }}
                itemPredicate={filterItem}
                createNewItemFromQuery={(q) => q}
                createNewItemRenderer={(query, active, handleClick) => (
                  <MenuItem
                    key="create"
                    icon="add"
                    text={`Use "${query}"`}
                    active={active}
                    onClick={handleClick}
                    roleStructure="listoption"
                  />
                )}
                noResults={<MenuItem disabled text="No results" roleStructure="listoption" />}
                inputProps={{ placeholder: 'Series name' }}
              />
            )}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Series #</label>
          <Controller
            control={control}
            name="SeriesIndex"
            render={({ field }) => (
              <input
                {...field}
                type="number"
                min="0"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Publisher</label>
          <Controller
            control={control}
            name="Publisher"
            render={({ field }) => (
              <input
                {...field}
                type="text"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Publisher"
              />
            )}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Language</label>
          <Controller
            control={control}
            name="Language"
            render={({ field }) => (
              <input
                {...field}
                type="text"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="en, fr, etc."
              />
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Rating</label>
          <Controller
            control={control}
            name="Rating"
            render={({ field }) => (
              <input
                {...field}
                type="number"
                min="0"
                max="5"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            )}
          />
          <p className="text-xs text-zinc-500 mt-1">0-5 stars</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Date Published</label>
          <Controller
            control={control}
            name="DatePublished"
            render={({ field }) => (
              <input
                {...field}
                type="date"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Controller
          control={control}
          name="IsRead"
          render={({ field }) => (
            <input
              type="checkbox"
              id="is-read"
              checked={field.value}
              onChange={e => field.onChange(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-blue-600"
            />
          )}
        />
        <label htmlFor="is-read" className="text-sm font-medium text-zinc-300 cursor-pointer">
          Marked as read
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Tags</label>
        <Controller
          control={control}
          name="Tags"
          render={({ field }) => (
            <MultiSelect<string>
              items={allTags}
              selectedItems={field.value}
              onItemSelect={(item) => {
                if (!field.value.includes(item)) {
                  field.onChange([...field.value, item])
                }
              }}
              onRemove={(item) => field.onChange(field.value.filter(t => t !== item))}
              tagRenderer={(item) => item}
              itemRenderer={(item, { handleClick, handleFocus, modifiers }) => {
                if (!modifiers.matchesPredicate) return null
                return (
                  <MenuItem
                    key={item}
                    text={item}
                    onClick={handleClick}
                    onFocus={handleFocus}
                    active={modifiers.active}
                    disabled={modifiers.disabled}
                    selected={field.value.includes(item)}
                    roleStructure="listoption"
                  />
                )
              }}
              itemPredicate={filterItem}
              createNewItemFromQuery={(q) => q}
              createNewItemRenderer={(query, active, handleClick) => (
                <MenuItem
                  key="create"
                  icon="add"
                  text={`Add "${query}"`}
                  active={active}
                  onClick={handleClick}
                  roleStructure="listoption"
                />
              )}
              noResults={<MenuItem disabled text="No results" roleStructure="listoption" />}
              placeholder="Add tag…"
            />
          )}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Description</label>
        <Controller
          control={control}
          name="Description"
          render={({ field }) => (
            <textarea
              {...field}
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
              placeholder="Book description"
            />
          )}
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-zinc-700">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
