;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname 2020w1-f-p2-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2020w1-f/f-p2)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;do not edit or delete this tag
(@problem 2) ;do not edit or delete this tag

;;
;; Design a function called longest-sequence that consumes a list of integers
;; and produces the longest sequence of consective integers that are each one
;; larger than the previous integer.  All of the following are examples of
;; sequences of consecutive integers:
;;
;;     (list 1 2 3 4)
;;     (list 2)
;;     empty
;;     (list -5 -4)
;;
;; Your solution MUST BE TAIL-RECURSIVE.
;; 
;; If there are multiple sequences of the same length in the input list, then
;; you must produce the first one (the left-most one) in the list.
;;
;; For example:
;;  (longest-sequence  (list 8 9 1 8 6 7))     must produce (list 8 9)
;;  (longest-sequence (list 8 7 8 -3 -2 -1 5)) must produce (list -3 -2 -1)
;;
;; You MAY want to call length, and if so that is fine, but it is not required.
;; You MAY also want to handle the empty list case in the trampoline.
;;
;; You must include all relevant design recipe elements and @tags.
;;
;; As always, a file that does not run or that produces errors when run will
;; lose a significant number of marks.  A file with failing tests is much
;; less bad.  Run your work often, so that you can check and fix errors as
;; soon as they creep in.  Also be sure to run every time before you submit.
;;

(@htdf longest-sequence)

(define (longest-sequence lon) empty)
