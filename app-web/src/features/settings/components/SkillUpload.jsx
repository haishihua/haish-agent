import React, { useEffect, useRef, useState } from 'react';
import { Check, FileArchive, LoaderCircle, Sparkles, X } from 'lucide-react';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../shared/ui/settings-elements/ui/dialog.tsx';
import { FileUpload, FileUploadDropzone, FileUploadTrigger, FileUploadList, FileUploadItem, FileUploadItemPreview, FileUploadItemMetadata, FileUploadItemDelete } from '../../../shared/ui/settings-elements/dice-ui/file-upload.tsx';
import { parseSkillPackage, SKILL_PACKAGE_MAX_SIZE, validateSkillPackageFile } from '../model/skill-package.js';

export function SkillUpload({ installedSkills, onInstall, onClose }) {
  const [files, setFiles] = useState([]);
  const [skill, setSkill] = useState(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState(false);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  const selectFiles = async (next) => {
    const request = ++sequence.current;
    setFiles(next); setSkill(null); setError(''); setReading(Boolean(next.length));
    if (!next.length) return;
    try {
      const bytes = new Uint8Array(await next[0].arrayBuffer());
      if (request !== sequence.current) return;
      const parsed = parseSkillPackage(bytes, next[0].name);
      if (installedSkills.some(item => item.name === parsed.name)) throw new Error(`${parsed.name} is already installed.`);
      setSkill(parsed);
    } catch (failure) { if (request === sequence.current) setError(failure.message); }
    finally { if (request === sequence.current) setReading(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !installing) onClose(); }}>
    <DialogContent className="skill-upload-dialog" aria-describedby={undefined} showCloseButton={!installing}>
      <DialogHeader><DialogTitle>Install skill</DialogTitle></DialogHeader>
      <FileUpload disabled={installing} value={files} onValueChange={selectFiles} accept=".zip,.skill,.ZIP,.SKILL" maxFiles={1} maxSize={SKILL_PACKAGE_MAX_SIZE} label="Skill package" onFileValidate={validateSkillPackageFile} onFileReject={(_, message) => setError(message)}>
        {!files.length && <FileUploadDropzone className="skill-dropzone">
          <span className="skill-dropzone-icon"><FileArchive size={24} /></span>
          <strong>Drop a skill package here</strong>
          <span className="skill-package-formats">.zip / .skill · up to 20 MB</span>
          <FileUploadTrigger asChild><Button variant="outline" size="sm">Choose file</Button></FileUploadTrigger>
        </FileUploadDropzone>}
        <FileUploadList>{files.map(file => <FileUploadItem key={`${file.name}-${file.lastModified}`} value={file} className="skill-upload-file">
          <FileUploadItemPreview />
          <FileUploadItemMetadata />
          <FileUploadItemDelete asChild><Button variant="ghost" size="icon-sm" aria-label="Remove package"><X size={15} /></Button></FileUploadItemDelete>
        </FileUploadItem>)}</FileUploadList>
      </FileUpload>
      {reading && <div className="skill-reading" role="status"><LoaderCircle size={15} className="spin" />Reading package…</div>}
      {skill && <div className="skill-package-result" role="status"><Sparkles size={20} /><div><strong>{skill.name}</strong><p>{skill.description}</p></div><Check size={16} /></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <DialogFooter><Button variant="ghost" size="sm" onClick={onClose} disabled={installing}>Cancel</Button><Button size="sm" disabled={!skill || reading || installing || Boolean(error)} onClick={async () => { setInstalling(true); try { if (await onInstall(skill, files[0]) !== false) onClose(); } catch (failure) { setError(String(failure?.message || failure)); } finally { setInstalling(false); } }}>{installing ? 'Installing…' : 'Install'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
