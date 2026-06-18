;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname lab-06-sol) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment 107/labs/lab-06)
(@cwl ???) 

;; CPSC 107 - 20 Questions Lab

(@problem 1)
;; Problem 1
;;
;; In the game 20 questions, there are two players.  The first player
;; (the "answerer") thinks of an object.  Then the second player
;; (the "questioner") asks a series of yes-no questions, and the answerer
;; answers each of them.  After the questioner thinks that she has
;; asked enough questions, she guesses the identity of the object
;; that the answerer had in mind.
;;
;; We can model this scenario using a binary tree.
;; Here is such a tree from a second-year computer science class

;; https://cs110.students.cs.ubc.ca/labs/lab-07-yes-no-tree.png

;; http://www.cs.duke.edu/courses/cps100/fall12/assignments/20q/

;; The nodes at the bottom of the tree (the "leaves") represent guesses
;; to the identity of the object.  The other nodes correspond to 
;; questions.  The left child of a question node describes what the
;; questioner will do if the answerer responds "yes" to the question:  
;; the right child describes the response to a "no" answer.  In general,
;; a tree of questions-and-answers is called a decision tree.
;;
;; Design a function that takes a decision tree and a Natural
;; and determines whether there is a path in the tree that arrives
;; at an answer after exactly n questions. Please design this as a
;; 2-one-of problem. Note that we've also given you a self-referential
;; data definition for Natural.
;;
;; NOTE: your function must take two arguments: a YesNoTree and a Natural, IN
;; THAT ORDER.

(@htdd YesNoTree)
(define-struct yntree (s y n))
;; YesNoTree is one of:
;; - String
;; - (make-yntree String YesNoTree YesNoTree)
;; interp. a yes-no question tree where:
;; + a string s is an answer
;; + (make-yntree s y n) represents a question s, with yes-decision y
;;    and no decision n
(define YNT0 "Raven")
(define YNT1 (make-yntree "Does it gobble?"
                          "Turkey"
                          (make-yntree "Does it say 'Nevermore'?"
                                       "Raven"
                                       "Eagle")))
(define YNT2 (make-yntree "Does it hop?"
                          "Kangaroo"
                          "Elephant"))
(define YNT3 (make-yntree "Is it wise?"
                          "Owl"
                          YNT1))

(@dd-template-rules one-of
                    atomic-non-distinct
                    compound
                    self-ref
                    self-ref)
(define (fn-for-ynt ynt)
  (cond
    [(string? ynt) (... ynt)]
    [else 
     (... (yntree-s ynt)
          (fn-for-ynt (yntree-y ynt))
          (fn-for-ynt (yntree-n ynt)))]))

(@htdd Natural)
;; Natural is one of:
;; - 0
;; - (add1 Natural)
;; interp. a natural number

(@dd-template-rules one-of
                    atomic-distinct
                    compound)

(define (fn-for-natural n)
  (cond [(zero? n) (...)]
        [else
         (... n       ; template rules wouldn't normally put this here
              ; but we know it may be useful
              (fn-for-natural (sub1 n)))]))


;; Complete Problem 1 below:

(@htdf contains-n-path?)
(@signature YesNoTree Natural -> Boolean)
(check-expect (contains-n-path? YNT0 0) true)
(check-expect (contains-n-path? YNT0 1) false)
(check-expect (contains-n-path? YNT1 0) false)
(check-expect (contains-n-path? YNT1 1) true)
(check-expect (contains-n-path? YNT1 2) true)
(check-expect (contains-n-path? YNT1 100) false)
(check-expect (contains-n-path? YNT1 0) false)
(check-expect (contains-n-path? YNT2 1) true)
(check-expect (contains-n-path? YNT2 2) false)
(check-expect (contains-n-path? YNT2 100) false)

;; CROSS PRODUCT OF TYPE COMMENTS TABLE
;;   ------------------------------------------------------------------------------------
;;  |                        |                n
;;  |                        |-----------------------------------------------------------
;;  |                        |   0   |     (add1 Natural)
;;--|------------------------------------------------------------------------------------
;;  |                        |                 (= n 0)
;; y| String                 |               
;; n|------------------------------------------------------------------------------------
;; t| (make-yntree String    | false | (or (contains-n-path? (yntree-y ynt)
;;  |              YesNoTree |       |                       (- n 1))
;;  |              YesNoTree)|       |     (contains-n-path? (yntree-n ynt)
;;  |                                                        (- n 1)))


; (define (contains-n-path? ynt n) false) ; stub

(@template-origin 2-one-of)
(define (contains-n-path? ynt n)
  (cond
    [(string? ynt) (= n 0)]
    [(= n 0) false]
    [else 
     (or (contains-n-path? (yntree-y ynt) (- n 1))
         (contains-n-path? (yntree-n ynt) (- n 1)))]))








(@problem 2)
;; Problem 2
;;
;; The starter contains the data definitions that represent a
;; family tree, as well as a completed design of a function
;; that tries to find the age of a person with a given name
;; in the family tree. Use local expressions to improve the
;; function. Be prepared to tell the TA which of three uses
;; of local to improve a function you are using.

(@htdd Person ListOfPerson)
(define-struct person (name age kids))
;; Person is (make-person String Natural ListOfPerson)
;; interp. A person, with first name, age and their children

;; ListOfPerson is one of:
;; - empty
;; - (cons Person ListOfPerson)
;; interp. a list of persons

(define P1 (make-person "N1" 5 empty))
(define P2 (make-person "N2" 25 (list P1)))
(define P3 (make-person "N3" 15 empty))
(define P4 (make-person "N4" 45 (list P3 P2)))
(define LOP0 empty)
(define LOP1 (list P1 P2 P3 P4))

(define (fn-for-person p)
  (... (person-name p)   ;String
       (person-age p)    ;Natural
       (fn-for-lop (person-kids p))))   

(define (fn-for-lop lop)
  (cond [(empty? lop) (...)]
        [else
         (... (fn-for-person (first lop))   
              (fn-for-lop (rest lop)))]))




(@htdf find)
(@signature String Person -> Natural or false) 
;; search given tree for person with name n, produce age if found; else false

(check-expect (find "N2" P1) false)
(check-expect (find "N1" P1) 5)
(check-expect (find "N1" P2) 5)
(check-expect (find "N3" P2) false)   
(check-expect (find "N2" P4) 25)
(check-expect (find "N1" P4) 5)

(@template-origin Person ListOfPerson try-catch encapsulated)

(define (find n_0 p_0)
  (local
    [(define (find--person n p)
       (if (string=? (person-name p) n)
           (person-age p) 
           (find--lop n (person-kids p))))

     (define (find--lop n lop)
       (cond [(empty? lop) false]
             [else
              (local
                [(define try (find--person n (first lop)))]
                (if (not (false? try)) 
                    try
                    (find--lop n (rest lop))))]
             ))
     ]
    (find--person n_0 p_0)
    )
  )



