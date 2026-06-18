;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p4-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)


(@assignment exams/2023w2-f/f-p4) ;Do not edit or remove this tag

(@cwl ???)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line

#|

You may know that DNA sequences are represented as strings of the first letter
of the chemical names of the bases - so strings of A, T, C, and G.  For very
long sequences like these, it can be convenient to use run-length encoding to
represent the sequence.  Done right, in run-length encoding, sequences of more
than 3 of a given letter together can take up less storage than the explicit
string of 3 letters.

In this problem we are going to use a VERY SIMPLIFIED version of run-length
encoding - too simple in fact to be ideally efficient.

NOTE IN PARTICULAR THAT WE ARE GOING TO OPERATE WITH (listof 1String) rather
than String as our non-encoded representation.

First carefully read this data definition.

|#
(@htdd RunLengthEncoding)

(define-struct rle (num str next))
;; RunLengthEncoding is one of:
;;  - false
;;  - (make-rle Natural 1String RunLengthEncoding)
;;
;; interp.
;;  A run-length encoding (RLE) of a string.
;;    - false represents the end of the string ("").
;;    - (make-rle num str next) represents a string of num occurrences
;;      of str, followed by whatever string next represents
;;
(define RLE-MTS false)
(define RLE-AAA    (make-rle 3 "A" false))
(define RLE-AAATT  (make-rle 3 "A" (make-rle 2 "T" false)))
(define RLE-CAAATT (make-rle 1 "C" (make-rle 3 "A" (make-rle 2 "B" false))))

(define (fn-for-rle rle)
  (cond [(false? rle) (...)]
        [else
         (... (rle-num rle)
              (rle-str rle)
              (fn-for-rle (rle-next rle)))]))

#|
 This problem provides you the CHOICE OF DESIGNING ONE OF TWO FUNCTIONS. 
 Both are worth the same amount, the grader will take the  maximum score
 between the two.

 BUT BE CAREFUL. The autograder is not going to add up the score from the two
 functions it will just take the max score between the two. That means it is
 probably in your interest to think about it for a short time, and then choose
 one function or  the other to pursue.

 ALSO NOTE THAT THE USUAL RULES ABOUT CHECK SYNTAX APPLY. Don't let a check
 syntax error in one problem cause the file to score 0 when the other function
 would have gotten partial credit.  DO NOT COMMENT OUT THE @htdf tag for the
 function you do not design.

 ALSO NOTE THAT the usual rules about Check Syntax apply. Don't let one
 function cause the file to score 0 when the other function would have
 gotten partial credit.

 NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
       IN YOUR SOLUTION.  Failure to follow these requirements may result in
       receiving zero marks for this problem.

 - There are two htdf tags below, choose one of them and complete a function
   design with that name.
 - You MUST FOLLOW all applicable design rules.
 - You MUST NOT COMMENT out any @ metadata tags.
 - We provide some check-expects below. You MUST NOT EDIT PROVIDED TESTS,
   but you will definitely want to add additional tests.
 - The file MUST NOT have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.
|#

(@htdf encode)
(@signature (listof 1String) -> RunLengthEncoding)
;; Encode a list of 1String into the correct RunLengthEncoding

(check-expect (encode (list "C" "A" "A" "A" "B" "B"))   ;provided test
              (make-rle 1 "C"
                        (make-rle 3 "A"
                                  (make-rle 2 "B"
                                            false))))

(define (encode los) false) ;stub




(@htdf decode)
(@signature RunLengthEncoding -> (listof 1String))
;; Decode a RunLengthEncoding into the list of 1String that it represents

(check-expect (decode (make-rle 1 "C"                   ;provided test
                        (make-rle 3 "A"
                                  (make-rle 2 "B"
                                            false))))
               (list "C" "A" "A" "A" "B" "B"))


(define (decode rle) empty) ;stub
