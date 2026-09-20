-- Optional link to the matching folder in the files (drive) module.
ALTER TABLE code.projects
    ADD COLUMN files_folder_id BLOB;
