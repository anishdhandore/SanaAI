# Resumes Directory

## Structure

```
resumes/
  ├── original/                    # Your original LaTeX resume project folder
  │   ├── resume.tex              # Main resume file
  │   ├── resume.cls              # Custom class file (if any)
  │   ├── resume.sty              # Style file (if any)
  │   ├── images/                 # Images folder (if any)
  │   └── ...                     # Other LaTeX project files
  └── optimized/                   # Job-specific optimized resumes
      ├── company1_job1/
      ├── company2_job2/
      └── ...
```

## Usage

1. **Store your original resume folder**: 
   - Place your entire LaTeX resume folder in `resumes/original/`
   - The main `.tex` file should be in this folder
   
2. **Upload through extension**: 
   - Upload the main `.tex` file (e.g., `resume.tex`) through the extension
   - The system will optimize the content while preserving LaTeX structure
   
3. **Optimized versions**: 
   - After processing, download the optimized `.tex` file
   - You can copy it back to your original folder structure if needed
   - Or keep separate optimized versions for each job

## Note

- Keep your original folder structure intact
- The system optimizes the main `.tex` file content
- You'll need to copy the optimized `.tex` back to your folder structure with all supporting files
- Original resume folder stays unchanged
