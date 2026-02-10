-- Storage policies for terms-and-conditions bucket

-- Allow authenticated admin/manager users to upload files
CREATE POLICY "Admins can upload T&C files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'terms-and-conditions'
  AND (auth.jwt() ->> 'user_level')::TEXT IN ('admin', 'manager')
);

-- Allow public read access to all T&C files
CREATE POLICY "Public can read T&C files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'terms-and-conditions');

-- Allow authenticated admin/manager users to update files
CREATE POLICY "Admins can update T&C files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'terms-and-conditions'
  AND (auth.jwt() ->> 'user_level')::TEXT IN ('admin', 'manager')
)
WITH CHECK (
  bucket_id = 'terms-and-conditions'
  AND (auth.jwt() ->> 'user_level')::TEXT IN ('admin', 'manager')
);

-- Allow authenticated admin users to delete files
CREATE POLICY "Admins can delete T&C files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'terms-and-conditions'
  AND (auth.jwt() ->> 'user_level')::TEXT = 'admin'
);
