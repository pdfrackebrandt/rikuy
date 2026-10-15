;;; xindy on ECL (main.c): the parts of CLISP that xindy's sources use, and their loading,
;;; as dump-xindy.lsp does it for CLISP's memory image.

;; xindy reads and writes its files byte for byte, as ISO-8859-1 (markup.lsp sets CLISP's
;; CUSTOM:*DEFAULT-FILE-ENCODING* to it)
(setf ext:*default-external-format* :latin-1)

;; CLISP's COMMON-LISP is also called LISP
(let ((si:*ignore-package-locks* t))
  (rename-package "COMMON-LISP" "COMMON-LISP"
                  (adjoin "LISP" (package-nicknames "COMMON-LISP") :test #'string=)))

(defpackage "CUSTOM" (:use) (:export "*DEFAULT-FILE-ENCODING*" "*SUPPRESS-CHECK-REDEFINITION*"))
(defvar custom:*default-file-encoding* :latin-1)
(defvar custom:*suppress-check-redefinition* nil)
(defpackage "CHARSET" (:use) (:export "ISO-8859-1"))
(defconstant charset:iso-8859-1 :latin-1)

;; CLISP's REGEXP module, as much as xindy uses: POSIX regular expressions (main.c)
(in-package "REGEXP")
(export '(regexp-compile regexp-exec match-start match-end match-string))
(defstruct (match (:constructor make-match (start end))) start end)
(defun regexp-compile (pattern &key extended case-insensitive ignore-case newline nosub)
  (declare (ignore newline nosub))
  (%regcomp pattern extended (or case-insensitive ignore-case)))
(defun regexp-exec (pattern string &key (start 0) end not-bol not-eol)
  (declare (ignore not-bol not-eol))
  (let ((m (%regexec pattern string start (or end -1))))
    (if m
        (values-list (mapcar #'(lambda (p) (and p (make-match (car p) (cdr p)))) m))
        (values))))
(defun match-string (string match)
  (subseq string (match-start match) (match-end match)))

(in-package "COMMON-LISP-USER")

;; any error's message as xindy writes it (patch_xindy.py)
(defun galley-format-arguments (c)
  (if (typep c 'simple-condition) (simple-condition-format-arguments c) (list c)))

;; base.lsp's ERROR-EXIT and EXIT-NORMALLY (patch_xindy.py), and CLISP's EXIT at the end of
;; xindy.pl's expression, end the run here
(defun galley-exit (&optional (code 0))
  (throw 'galley-exit (if (integerp code) code (if code 0 1))))

;; one evaluation of xindy.pl's expression, in the folder the program runs in (relative names
;; are merged with *DEFAULT-PATHNAME-DEFAULTS*, which would otherwise stay where xindy was loaded)
(defun galley-run (string)
  (setf *default-pathname-defaults* (ext:getcwd))
  (unwind-protect
       (catch 'galley-exit
         (handler-case
             (with-input-from-string (in string)
               (loop with eof = (gensym)
                     for form = (read in nil eof)
                     until (eq form eof)
                     do (eval form))
               0)
           (error (c)
             (format *error-output* "~&*** - ~A~%" c)
             1)))
    (finish-output *standard-output*)
    (finish-output *error-output*)))

(defun galley-load-xindy (dir)
  (let ((*load-verbose* nil) (*compile-verbose* nil))
    (dolist (f '("base" "locref" "ordrules" "idxstyle" "index" "version" "markup"))
      (load (concatenate 'string dir f ".lsp")))
    (load (concatenate 'string dir "defaults.xdy"))
    (setq *load-verbose* nil)
    (shadow 'require)
    (shadowing-import (symbol-value (find-symbol "*IDXSTYLE-USER-INTERFACE-DEFINITIONS*" "IDXSTYLE")))
    (import (symbol-value (find-symbol "*MARKUP-USER-INTERFACE-DEFINITIONS*" "MARKUP")))
    (import (symbol-value (find-symbol "*RAW-INDEX-INTERFACE-DEFINITIONS*" "INDEX")))
    (unless (fboundp 'exit)
      (setf (fdefinition 'exit) #'galley-exit))
    0))
