import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Book, metadata } from '../types'
import { UpdateBook } from '../../wailsjs/go/main/App'

const schema = z.object({
  Title: z.string().min(1, 'Title is required'),
  Authors: z.string(),
  Publisher: z.string(),
  Series: z.string(),
  SeriesIndex: z.coerce.number().min(0),
  Language: z.string(),
  Description: z.string(),
  Tags: z.string(),
  Rating: z.coerce.number().min(0).max(5).int(),
  DatePublished: z.string(),
  IsRead: z.boolean(),
})

type FormValues = z.infer<typeof schema>

function toFormValues(book: Book): FormValues {
  return {
    Title: book.Title,
    Authors: book.Authors.join(', '),
    Publisher: book.Publisher,
    Series: book.Series,
    SeriesIndex: book.SeriesIndex,
    Language: book.Language,
    Description: book.Description,
    Tags: book.Tags.join(', '),
    Rating: book.Rating,
    DatePublished: book.DatePublished.slice(0, 10),
    IsRead: book.IsRead,
  }
}

function toBook(values: FormValues, originalBook: Book): Book {
  return new metadata.Book({
    ID: originalBook.ID,
    Title: values.Title,
    Authors: values.Authors.split(',').map(a => a.trim()).filter(Boolean),
    Publisher: values.Publisher,
    Series: values.Series,
    SeriesIndex: values.SeriesIndex,
    Language: values.Language,
    Description: values.Description,
    Tags: values.Tags.split(',').map(t => t.trim()).filter(Boolean),
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

export function BookEditForm({ book, onClose, onSave }: Props) {
  // zodResolver is typed with coerce's `unknown` input which conflicts with FormValues;
  // the cast is necessary until @hookform/resolvers aligns with zod v4 coerce inference.
  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: toFormValues(book),
  })

  useEffect(() => {
    reset(toFormValues(book))
  }, [book, reset])

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
              <input
                {...field}
                type="text"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Author 1, Author 2"
              />
            )}
          />
          <p className="text-xs text-zinc-500 mt-1">Comma-separated</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Series</label>
            <Controller
              control={control}
              name="Series"
              render={({ field }) => (
                <input
                  {...field}
                  type="text"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Series name"
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
              <input
                {...field}
                type="text"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="tag1, tag2, tag3"
              />
            )}
          />
          <p className="text-xs text-zinc-500 mt-1">Comma-separated</p>
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
