import { Box, SimpleGrid, Image, ActionIcon } from '@mantine/core';

export default function CommentImages({
  images,
  onImageClick,
  onImageRemove,
  maxColumns = 10,
  allowRemove = true,
}) {
  if (!images.length) return null;

  return (
    <Box sx={{ flex: 1, maxWidth: '70%' }}>
      <SimpleGrid cols={maxColumns} spacing="md">
        {images.map((image, index) => (
          <Box key={index} sx={{ position: 'relative' }}>
            <Image
              src={image}
              alt=""
              radius="sm"
              className="cursor-pointer !w-[100px] !h-[100px] object-cover border border-gray-200 rounded-md"
              onClick={() => onImageClick(image)}
            />
            {allowRemove && (
              <ActionIcon
                color="red"
                radius="xl"
                size="sm"
                variant="filled"
                onClick={() => onImageRemove(index)}
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  transform: 'translate(50%, -50%)',
                  opacity: 0,
                  '&:hover': {
                    opacity: 1,
                  },
                }}
              >
                <IconX size={16} />
              </ActionIcon>
            )}
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}
