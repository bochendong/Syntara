;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname cs107-lab09-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(@assignment 107/labs/lab-09)
(@cwl ???) ;; !!! REPLACE ??? with your cwl to hand this file in

;; CPSC 107 - Huffman Code Lab

(@problem 1)
;; Using the data definitions below, design a function called can-encode? that
;; takes a letter (NOT an entire word) and a Huffman code tree and produces true
;; if that letter is reachable in the given tree, false otherwise. You should
;; not use any accumulators. As a reminder, we have asked you to blend the
;; backtracking template into your design.

;; We have provided the signature, purpose, stub, and some tests.

(@htdd HTree)
(define-struct htree (zero one))
;; HTree is one of
;; - String
;; - (make-htree HTree HTree)
;; interp. A Huffman code tree where
;; a string s is an encoded value
;; (make-htree z o) is a tree with zero-branch z and one-branch o
(define HT0 "A")

(define HTMAGIC
  (make-htree "A"
              (make-htree 
               (make-htree "B"
                           (make-htree "C" "D"))
               "R")))

(@dd-template-rules one-of
                    atomic-non-distinct ;; String
                    compound            ;; 2 fields
                    self-ref            ;; Htree
                    self-ref)           ;; Htree
#;
(define (fn-for-htree ht)
  (cond [(string? ht) (... ht)]
        [else
         (... (fn-for-htree (htree-zero ht))
              (fn-for-htree (htree-one ht)))]))




(@htdf can-encode?)
(@signature HTree String -> Boolean)
;; produce if the given string is reachable in the given tree, false otherwise
(check-expect (can-encode? "A" "A") true)
(check-expect (can-encode? "A" "B") false) 
(check-expect (can-encode? HTMAGIC "A") true)
(check-expect (can-encode? HTMAGIC "E") false)

(define (can-encode? ht s) false)


;; Problem 2:
(@problem 2)
;; When spelling correction first appeared in typewriters, it was very important
;; to store the information about legal words as compactly as possible. One
;; technique for doing so was to use prefix trees, in which all words that start
;; with the same prefix share the same data representation for that common 
;; prefix. They only have different data for their different endings. For 
;; example, part of the prefix tree starting at t would look like this: 

;; https://cs110.students.cs.ubc.ca/labs/lab-10-prefix-tree.png


;; Of course, the complete tree starting at t is much bigger.

;; Each node in the prefix tree has its letter and a flag indicating whether the
;; path from the root of the tree to that node is a legal node. In the picture,
;; the * on some nodes indicate that the tree up to that point is a legal word.
;; For example, the sequence of letters t-o-o is a legal word because when we
;; start from t, then to o, then to the second o, we are a node with *. But the
;; sequence t-o-u is not legal because going from t, then o, then u lands at a
;; node without *. Every full path is a legal word because it would waste space
;; to store bad words that you don't need.


;; Design a function called count-odds that takes a prefix spelling tree
;; and determines how many odd-length words are contained in it. 

;; We have provided the data definition for prefix trees below. 

(@htdd PrefixTree)
(define-struct pt (l f? subs))
;; PrefixTree is (make-pt String Boolean (listof PrefixTree))
;; interp. a prefix spelling tree.  The sequence of letters up to and including
;;         a given node are a legal word if f? is true, not legal otherwise.

(define PT0 (make-pt "K" true empty))
(define PTT 
  (make-pt "t" false
           (list 
            (make-pt "o" true
                     (list 
                      (make-pt "o" true (list (make-pt "k" true empty)))
                      (make-pt "t" true empty)
                      (make-pt "l" false (list (make-pt "l" true empty)))
                      (make-pt "u" false
                               (list 
                                (make-pt "c" false
                                         (list (make-pt "h" true empty)))))))
            (make-pt "i" false
                     (list (make-pt "n" true empty))))))


(define LOPT0 (list (make-pt "o" true empty)
                    (make-pt "t" true empty)))

(@dd-template-rules compound            ;; 3 fields
                    atomic-non-distinct ;; String
                    atomic-non-distinct ;; Boolean 
                    self-ref)           ;; (listof PrefixTree) !!!
#;
(define (fn-for-pt pt)
  (local [(define (fn-for-pt pt)
            (... (pt-l pt)
                 (pt-f? pt)
                 (fn-for-lopt (pt-subs pt))))
          (define (fn-for-lopt lopt)
            (cond [(empty? lopt) (...)]
                  [else
                   (... (fn-for-pt (first lopt))
                        (fn-for-lopt (rest lopt)))]))]
    (fn-for-pt pt)))


;(@htdf count-odds) UNCOMMENT WHEN YOU START PROBLEM 2










;; Problem 3:

;; Copy your function design from Task 1 and refactor it to produce a list of 
;; the binary digits on the path to a given string in the tree, or false if  
;; that string cannot be reached in the given tree. Use a result-so-far
;; accumulator. Call this function encode.
(@problem 3)
;(@htdf encode)  UNCOMMENT WHEN YOU START PROBLEM 3



