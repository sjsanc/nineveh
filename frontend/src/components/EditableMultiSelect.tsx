import { Control, Controller, FieldPathByValue, FieldValues } from 'react-hook-form'
import { MenuItem } from '@blueprintjs/core'
import { MultiSelect } from '@blueprintjs/select'
import { filterItem } from '../utils'

interface Props<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>
  name: FieldPathByValue<TFieldValues, string[]>
  items: string[]
  placeholder: string
}

export function EditableMultiSelect<TFieldValues extends FieldValues>({
  control,
  name,
  items,
  placeholder,
}: Props<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const value = (field.value ?? []) as string[]
        return (
          <MultiSelect<string>
            items={items}
            selectedItems={value}
            onItemSelect={(item) => {
              if (!value.includes(item)) field.onChange([...value, item])
            }}
            onRemove={(item) => field.onChange(value.filter((v) => v !== item))}
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
                  selected={value.includes(item)}
                  roleStructure="listoption"
                />
              )
            }}
            itemPredicate={filterItem}
            createNewItemFromQuery={(q) => q}
            createNewItemRenderer={(query, active, handleClick) => (
              <MenuItem key="create" icon="add" text={`Add "${query}"`} active={active} onClick={handleClick} roleStructure="listoption" />
            )}
            noResults={<MenuItem disabled text="No results" roleStructure="listoption" />}
            placeholder={placeholder}
            popoverProps={{ popoverClassName: 'bp6-dark' }}
          />
        )
      }}
    />
  )
}
