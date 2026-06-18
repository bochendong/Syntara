;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w1-f/f-p6)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;do not edit or delete this tag
(@problem 2) ;do not edit or delete this tag
(@problem 3) ;do not edit or delete this tag
(@problem 4) ;do not edit or delete this tag
(@problem 5) ;do not edit or delete this tag
(@problem 6) ;do not edit or delete this tag

;; Given the partial data definition below, determine the signature of the
;; abstract function fold-stuff.  Note that we are DELIBERATELY not giving
;; you a complete type comment for Stuff.
;;
;; Your answer should be in the form of an @signature tag, with no comments.
;; You may do any scratch work BELOW the function definition, and you may
;; leave that scratch work behind provided that it is commented out.  All
;; that will be graded in this file is the one uncommented @signature tag.
;;
;; This file will be autograded.  Please run often while you are working on
;; it, and run right before you submit each time.  A file that cannot run
;; will receive 0 marks.

(@htdd Stuff)
(define-struct stuff (a b c))
;; Stuff is (make-stuff ...)

(@htdf fold-stuff)
;; UNCOMMENT THIS NEXT LINE AND FILL IN YOUR ANSWER
;(@signature  ) 

(define (fold-stuff c1 c2 c3 b1 b2 s0)
  (local [(define (foo s)
            (c1 (stuff-a s)
                (bar (stuff-b s))
                (baz (stuff-c s))))

          (define (bar los)
            (cond [(empty? los) b1]
                  [else
                   (c2 (foo (first los))
                        (bar (rest los)))]))

          (define (baz n)
            (cond [(zero? n) b2]
                  [else
                   (c3 n
                       (baz (sub1 n)))]))]

    (foo s0)))
